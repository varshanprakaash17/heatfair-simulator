"""Simulation orchestration shared by the API routers.

Keeping this out of the route layer makes the same code path reusable for the
optimiser, the report generator and the tests, and guarantees that a stored
simulation and an on-screen simulation are produced identically.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..engine.constants import MODEL_VERSION
from ..engine.incentive import PolicySpec
from ..engine.scenario import ScenarioSpec
from ..engine.simulation import SimulationRequest, run_simulation
from ..engine.workers import (
    WorkerPopulation,
    generate_workers,
    merge_populations,
    population_from_profiles,
)
from ..models import Policy, Scenario, Simulation, SimulationResult, WeatherSnapshot, WorkerProfile
from ..optimizer.search import OptimizationOutcome, optimize
from . import insights, serializers, weather as weather_service
from .seed import ensure_demo_data


class SimulationError(Exception):
    """Raised for user-addressable simulation failures."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class ExecutedSimulation:
    simulation: Simulation
    results: dict


def saved_worker_profiles(db: Session, organization_id: str) -> list[WorkerProfile]:
    """Worker profiles the user saved for this organization (not synthetic)."""
    return list(
        db.execute(
            select(WorkerProfile)
            .where(
                WorkerProfile.organization_id == organization_id,
                WorkerProfile.synthetic.is_(False),
            )
            .order_by(WorkerProfile.created_at)
        )
        .scalars()
        .all()
    )


def build_population(size: int, seed: int, saved=None) -> WorkerPopulation:
    """Build the evaluated population: saved profiles first, synthetic fills the rest.

    The requested size stays the total population size, so a 500-worker run with
    two saved profiles evaluates 498 synthetic + 2 saved workers.
    """
    saved_rows = list(saved or [])[:size]
    synthetic_size = max(size - len(saved_rows), 0)
    generated: WorkerPopulation | None = None
    if synthetic_size > 0:
        try:
            generated = generate_workers(size=synthetic_size, seed=seed)
        except ValueError as exc:
            raise SimulationError(str(exc), 422) from exc
    if not saved_rows:
        if generated is None:
            raise SimulationError("Population size must be at least 1", 422)
        return generated
    saved_population = population_from_profiles(saved_rows)
    if generated is None:
        return saved_population
    return merge_populations(generated, saved_population)


def population_breakdown(population: WorkerPopulation, saved_count: int) -> dict:
    return {
        "synthetic": max(population.size - saved_count, 0),
        "saved": saved_count,
        "total": population.size,
    }


def execute_and_store(
    db: Session,
    organization_id: str,
    policy: Policy,
    scenario: Scenario,
    population: WorkerPopulation,
    random_seed: int,
    simulation_duration_days: int = 1,
    label: str | None = None,
    weather_snapshot: WeatherSnapshot | None = None,
    weather_payload: dict | None = None,
    breakdown: dict | None = None,
) -> ExecutedSimulation:
    """Run the engine and persist simulation + results rows."""
    started = time.perf_counter()
    sim = Simulation(
        organization_id=organization_id,
        policy_id=policy.id,
        scenario_id=scenario.id,
        status="running",
        model_version=MODEL_VERSION,
        random_seed=random_seed,
        weather_snapshot_id=weather_snapshot.id if weather_snapshot else None,
        configuration=serializers.json_safe(
            {
                "population_size": population.size,
                "population_seed": population.seed,
                "population_breakdown": breakdown,
                "include_saved_workers": bool(breakdown and breakdown.get("saved")),
                "simulation_duration_days": simulation_duration_days,
                "label": label or f"{policy.name} · {scenario.name}",
                "policy": serializers.policy_payload(policy),
                "scenario": serializers.scenario_payload(scenario, with_preview=False),
                "weather": weather_payload,
            }
        ),
    )
    db.add(sim)
    db.flush()

    try:
        results = run_simulation(
            SimulationRequest(
                policy=serializers.policy_spec(policy),
                scenario=serializers.scenario_spec(scenario),
                workers=population,
                seed=random_seed,
                simulation_duration_days=simulation_duration_days,
            )
        )
    except Exception as exc:  # noqa: BLE001 - persisted for the UI
        sim.status = "failed"
        sim.error = str(exc)
        sim.duration_ms = round((time.perf_counter() - started) * 1000, 2)
        db.commit()
        raise SimulationError(f"Simulation failed: {exc}", 500) from exc

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

    results["reproducibility"]["days"] = simulation_duration_days
    metrics = results["metrics"]
    summary = {
        "label": sim.configuration["label"],
        "policy_name": policy.name,
        "scenario_name": scenario.name,
        "population_size": population.size,
        "population_breakdown": breakdown,
        "exposure_index": metrics["exposure_index"],
        "break_accessibility": metrics["break_accessibility"],
        "income_retention": metrics["income_retention"],
        "operational_disruption": metrics["operational_disruption"],
        "operational_efficiency": metrics["operational_efficiency"],
        "incentive_pressure_index": metrics["incentive_pressure_index"],
        "workers_exposed_above_60": metrics["workers_exposed_above_60"],
        "policy_cost_per_worker_shift": metrics["policy_cost"]["total_cost_per_worker_shift"],
        "recommendations": insights.build_recommendations(
            metrics, results["policy"], results["scenario"]
        ),
        "weather_location": (weather_payload or {}).get("location", {}).get("name"),
        "weather_source": (weather_payload or {}).get("weather_source"),
        "weather_type": (weather_payload or {}).get("weather_type"),
        "weather_retrieved_at": (weather_payload or {}).get("retrieved_at"),
    }

    stored_metrics = {
        "metrics": metrics,
        "hourly": results["hourly"],
        "by_occupation": results["by_occupation"],
        "charts": results["charts"],
        "policy": results["policy"],
        "scenario": results["scenario"],
        "workers_summary": results["workers_summary"],
        "limitations": results["limitations"],
        "reproducibility": results["reproducibility"],
        "weather": weather_payload,
    }

    db.add(
        SimulationResult(
            simulation_id=sim.id,
            metrics=serializers.json_safe(stored_metrics),
            assumptions=serializers.json_safe(results["assumptions"]),
        )
    )
    sim.status = "completed"
    sim.summary = serializers.json_safe(summary)
    sim.duration_ms = elapsed_ms
    db.commit()
    db.refresh(sim)

    results["simulation_id"] = sim.id
    results["recommendations"] = summary["recommendations"]
    results["weather"] = weather_payload
    return ExecutedSimulation(simulation=sim, results=results)


def _weather_payload(weather: dict, snapshot: WeatherSnapshot) -> dict:
    """Compact, JSON-safe weather provenance stored with the simulation."""
    shift = weather["shift"]
    return serializers.json_safe(
        {
            "snapshot_id": snapshot.id,
            "location": weather.get("location", {}),
            "latitude": snapshot.latitude,
            "longitude": snapshot.longitude,
            "timezone": snapshot.timezone,
            "weather_source": "open-meteo",
            "provider": weather.get("provider", "Open-Meteo Forecast API"),
            "api_url": weather.get("api_url"),
            "weather_type": "forecast",
            "data_note": weather.get("data_note"),
            "retrieved_at": weather.get("retrieved_at"),
            "source_timestamp": weather.get("source_timestamp"),
            "forecast_date": shift.get("date"),
            "shift": {
                "date": shift.get("date"),
                "start_hour": shift.get("start_hour"),
                "end_hour": shift.get("end_hour"),
                "hours": shift.get("hours"),
                "mean_temperature": shift.get("mean_temperature"),
                "mean_humidity": shift.get("mean_humidity"),
                "conditions": shift.get("conditions"),
            },
            "current": weather.get("current"),
            "units": weather.get("units"),
            "missing_variables": weather.get("missing_variables", []),
            "cached": weather.get("cached", False),
        }
    )


def run_live_weather(
    db: Session,
    organization_id: str,
    policy_id: str,
    latitude: float,
    longitude: float,
    location_name: str | None,
    work_start_hour: int,
    work_end_hour: int,
    population_size: int,
    random_seed: int,
    simulation_duration_days: int = 1,
    label: str | None = None,
    force_weather: bool = False,
    include_saved_workers: bool = True,
) -> ExecutedSimulation:
    """Run against the latest available Open-Meteo forecast for the location.

    The provider is called server-side. If it fails, the request fails with a
    clear error; synthetic weather is never silently substituted.
    """
    policy = db.get(Policy, policy_id)
    if policy is None or policy.organization_id != organization_id:
        raise SimulationError("Policy not found for this organization", 404)

    try:
        weather = weather_service.forecast_for_shift(
            latitude,
            longitude,
            start_hour=work_start_hour,
            end_hour=work_end_hour,
            location_name=location_name or "Selected workplace location",
            force=force_weather,
        )
    except weather_service.WeatherServiceError as exc:
        raise SimulationError(f"Live weather unavailable: {exc}", 502) from exc
    except ValueError as exc:
        raise SimulationError(str(exc), 422) from exc

    shift = weather["shift"]
    conditions = shift.get("conditions") or []
    incomplete = [
        row for row in conditions if row.get("temperature") is None or row.get("humidity") is None
    ]
    if not conditions or incomplete:
        raise SimulationError(
            "The weather provider did not return complete temperature and humidity values for every hour of the selected shift. Try a different window or retry.",
            502,
        )

    location = weather.get("location", {})
    snapshot = WeatherSnapshot(
        location_name=location.get("name") or location_name or "Selected workplace location",
        latitude=latitude,
        longitude=longitude,
        timezone=location.get("timezone"),
        weather_source="open-meteo",
        retrieved_at=datetime.fromisoformat(weather["retrieved_at"]),
        source_timestamp=weather.get("source_timestamp"),
        weather_type="forecast",
        forecast_date=shift.get("date"),
        current_conditions=weather.get("current"),
        hourly_conditions=serializers.json_safe(
            {"all": weather.get("hourly"), "shift": shift.get("rows"), "shift_meta": {k: v for k, v in shift.items() if k not in ("rows", "conditions")}}
        ),
        requested_hours=serializers.json_safe(
            {"start_hour": work_start_hour, "end_hour": work_end_hour, "date": shift.get("date")}
        ),
        units=weather.get("units"),
    )
    db.add(snapshot)
    db.flush()

    location_label = location.get("name") or location_name or "Selected workplace location"
    scenario_name = (
        f"Live Open-Meteo · {location_label} · {shift.get('date')} "
        f"{work_start_hour:02d}:00–{work_end_hour:02d}:00 · {uuid4().hex[:6]}"
    )
    scenario = Scenario(
        name=scenario_name,
        temperature=shift.get("mean_temperature") or 30.0,
        humidity=shift.get("mean_humidity") or 60.0,
        work_duration=float(work_end_hour - work_start_hour),
        work_intensity="heavy",
        shift_start_hour=work_start_hour,
        hourly_conditions=[
            {
                "hour": row["hour"],
                "temperature": row["temperature"],
                "humidity": row["humidity"],
            }
            for row in conditions
        ],
        location=serializers.json_safe(
            {
                "name": location_label,
                "latitude": latitude,
                "longitude": longitude,
                "timezone": location.get("timezone"),
                "weather_type": "forecast",
                "weather_source": "open-meteo",
                "retrieved_at": weather.get("retrieved_at"),
                "source_timestamp": weather.get("source_timestamp"),
                "forecast_date": shift.get("date"),
                "weather_snapshot_id": snapshot.id,
            }
        ),
        source="open-meteo",
    )
    db.add(scenario)
    db.flush()

    saved = saved_worker_profiles(db, organization_id) if include_saved_workers else []
    population = build_population(population_size, random_seed, saved)
    breakdown = population_breakdown(population, min(len(saved), population_size))
    weather_payload = _weather_payload(weather, snapshot)
    return execute_and_store(
        db,
        organization_id,
        policy,
        scenario,
        population,
        random_seed,
        simulation_duration_days,
        label or f"Live weather · {location_label} · {shift.get('date')}",
        weather_snapshot=snapshot,
        weather_payload=weather_payload,
        breakdown=breakdown,
    )


def run_for_ids(
    db: Session,
    organization_id: str,
    policy_id: str,
    scenario_id: str,
    population_size: int,
    random_seed: int,
    simulation_duration_days: int = 1,
    label: str | None = None,
    include_saved_workers: bool = True,
) -> ExecutedSimulation:
    policy = db.get(Policy, policy_id)
    if policy is None or policy.organization_id != organization_id:
        raise SimulationError("Policy not found for this organization", 404)
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise SimulationError("Scenario not found", 404)
    saved = saved_worker_profiles(db, organization_id) if include_saved_workers else []
    population = build_population(population_size, random_seed, saved)
    breakdown = population_breakdown(population, min(len(saved), population_size))
    return execute_and_store(
        db, organization_id, policy, scenario, population, random_seed,
        simulation_duration_days, label, breakdown=breakdown,
    )


def latest_result(db: Session, simulation_id: str) -> SimulationResult | None:
    return db.execute(
        select(SimulationResult)
        .where(SimulationResult.simulation_id == simulation_id)
        .order_by(SimulationResult.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def run_optimization(
    db: Session,
    simulation: Simulation,
    candidate_count: int,
    seed: int,
    constraints: dict | None = None,
    population_size: int | None = None,
) -> OptimizationOutcome:
    policy = db.get(Policy, simulation.policy_id)
    scenario = db.get(Scenario, simulation.scenario_id)
    if policy is None or scenario is None:
        raise SimulationError("Simulation policy or scenario is missing", 404)

    config = simulation.configuration or {}
    size = population_size or int(config.get("population_size", 400))
    saved = (
        saved_worker_profiles(db, simulation.organization_id)
        if config.get("include_saved_workers", True)
        else []
    )
    population = build_population(
        min(size, 2000), int(config.get("population_seed", seed)), saved
    )

    outcome = optimize(
        serializers.policy_spec(policy),
        serializers.scenario_spec(scenario),
        population,
        candidate_count=candidate_count,
        seed=seed,
        constraints=constraints,
    )

    from ..models import PolicyCandidate

    db.query(PolicyCandidate).filter(PolicyCandidate.simulation_id == simulation.id).delete()
    for rec in outcome.candidates:
        db.add(
            PolicyCandidate(
                simulation_id=simulation.id,
                candidate_key=rec["id"],
                label=rec["label"],
                policy_configuration=rec["policy"],
                objective_values={
                    "objectives": rec["objectives"],
                    "supporting_metrics": rec.get("supporting_metrics", {}),
                    "changed_parameters": rec.get("changed_parameters", []),
                    "feasible": rec.get("feasible", True),
                    "violations": rec.get("violations", []),
                    "strategy": rec.get("strategy", ""),
                    "normalised": rec.get("normalised", {}),
                    "recommended": rec.get("recommended", False),
                },
                is_pareto_optimal=bool(rec.get("on_frontier")),
                feasible=bool(rec.get("feasible", True)),
            )
        )

    configuration = dict(config)
    configuration["optimization"] = serializers.json_safe({
        "generated": outcome.generated,
        "evaluated": outcome.evaluated,
        "feasible": outcome.feasible,
        "constraints": outcome.constraints,
        "ranges": outcome.ranges,
        "notes": outcome.notes,
        "seed": outcome.seed,
        "population_size": min(size, 2000),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    simulation.configuration = configuration
    db.commit()
    return outcome


def stored_optimization(db: Session, simulation: Simulation) -> dict | None:
    """Rebuild the optimizer payload from stored candidate rows."""
    from ..models import PolicyCandidate

    rows = (
        db.execute(
            select(PolicyCandidate).where(PolicyCandidate.simulation_id == simulation.id)
        )
        .scalars()
        .all()
    )
    if not rows:
        return None

    candidates = []
    for row in rows:
        values = row.objective_values or {}
        candidates.append(
            {
                "id": row.candidate_key,
                "label": row.label,
                "policy": row.policy_configuration,
                **values,
                "is_pareto_optimal": row.is_pareto_optimal,
                "on_frontier": row.is_pareto_optimal,
                "feasible": row.feasible,
            }
        )

    meta = (simulation.configuration or {}).get("optimization", {})
    frontier = [c for c in candidates if c["on_frontier"]]
    frontier.sort(key=lambda c: c["objectives"]["exposure"])
    return {
        "simulation_id": simulation.id,
        "generated": meta.get("generated", len(candidates)),
        "evaluated": meta.get("evaluated", len(candidates)),
        "feasible": meta.get("feasible", sum(1 for c in candidates if c["feasible"])),
        "constraints": meta.get("constraints", {}),
        "ranges": meta.get("ranges", {}),
        "candidates": candidates,
        "frontier": frontier,
        "notes": meta.get("notes", []),
        "seed": meta.get("seed", 42),
        "completed_at": meta.get("completed_at"),
    }


def ensure_demo_org(db: Session) -> str:
    org = ensure_demo_data(db)
    return org.id
