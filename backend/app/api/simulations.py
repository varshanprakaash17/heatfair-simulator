from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from reportlab.lib.pagesizes import A4  # noqa: F401  (keeps reportlab import warm)
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..api.auth import get_optional_user, require_org_membership
from ..db import get_db
from ..models import Organization, Policy, Report, Simulation, User
from ..optimizer.search import candidate_to_policy_dict
from ..schemas import ApplyCandidateRequest, OptimizeRequest, SimulationRunRequest
from ..services import insights, reports, serializers, simulation_service as svc
from ..services.pareto_payload import optimization_payload

router = APIRouter(prefix="/simulations", tags=["simulations"])


@router.post("/run", status_code=201)
def run_simulation_endpoint(
    payload: SimulationRunRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Run a simulation synchronously and persist the result.

    A 500-worker, 9-hour scenario completes in well under a second on a laptop,
    so no background queue is required; the response includes the measured
    duration for transparency.
    """
    require_org_membership(organization_id=payload.organization_id, user=user, db=db)
    try:
        if payload.scenario_id:
            executed = svc.run_for_ids(
                db,
                organization_id=payload.organization_id,
                policy_id=payload.policy_id,
                scenario_id=payload.scenario_id,
                population_size=payload.population_size,
                random_seed=payload.random_seed,
                simulation_duration_days=payload.simulation_duration_days,
                label=payload.label,
                include_saved_workers=payload.include_saved_workers,
            )
        else:
            executed = svc.run_live_weather(
                db,
                organization_id=payload.organization_id,
                policy_id=payload.policy_id,
                latitude=float(payload.latitude),
                longitude=float(payload.longitude),
                location_name=payload.location_name,
                work_start_hour=payload.work_start_hour,
                work_end_hour=payload.work_end_hour,
                population_size=payload.population_size,
                random_seed=payload.random_seed,
                simulation_duration_days=payload.simulation_duration_days,
                label=payload.label,
                include_saved_workers=payload.include_saved_workers,
            )
    except svc.SimulationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return {
        "simulation": serializers.simulation_payload(executed.simulation),
        "results": executed.results,
    }


@router.get("")
def list_simulations(
    organization_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    stmt = select(Simulation).order_by(Simulation.created_at.desc()).limit(limit)
    if organization_id:
        require_org_membership(organization_id=organization_id, user=user, db=db)
        stmt = stmt.where(Simulation.organization_id == organization_id)
    simulations = db.execute(stmt).scalars().all()
    payloads = []
    for s in simulations:
        summary = s.summary or {}
        payloads.append(
            {
                **serializers.simulation_payload(s),
                "label": summary.get("label"),
                "policy_name": summary.get("policy_name")
                or (s.configuration or {}).get("policy", {}).get("name"),
                "scenario_name": summary.get("scenario_name")
                or (s.configuration or {}).get("scenario", {}).get("name"),
                "population_size": summary.get("population_size"),
                "exposure_index": summary.get("exposure_index"),
                "income_retention": summary.get("income_retention"),
                "break_accessibility": summary.get("break_accessibility"),
                "operational_efficiency": summary.get("operational_efficiency"),
                "weather_location": summary.get("weather_location"),
                "weather_type": summary.get("weather_type"),
                "has_optimization": bool((s.configuration or {}).get("optimization")),
            }
        )
    return payloads


@router.get("/{simulation_id}")
def get_simulation(simulation_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    optimization = svc.stored_optimization(db, simulation)
    return {
        **serializers.simulation_payload(simulation),
        "has_optimization": optimization is not None,
        "optimization_summary": (
            {
                "frontier_size": len(optimization["frontier"]),
                "evaluated": optimization["evaluated"],
                "feasible": optimization["feasible"],
            }
            if optimization
            else None
        ),
    }


@router.get("/{simulation_id}/results")
def get_results(simulation_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    if simulation.status == "failed":
        raise HTTPException(
            status_code=409, detail=simulation.error or "Simulation failed before producing results"
        )
    result = svc.latest_result(db, simulation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No results stored for this simulation yet")

    payload = serializers.results_payload(simulation, result)
    payload["recommendations"] = (
        simulation.summary or {}
    ).get("recommendations") or insights.build_recommendations(
        payload["metrics"], payload["policy"] or {}, payload["scenario"] or {}
    )
    optimization = svc.stored_optimization(db, simulation)
    payload["optimization"] = (
        {
            "frontier_size": len(optimization["frontier"]),
            "evaluated": optimization["evaluated"],
            "feasible": optimization["feasible"],
        }
        if optimization
        else None
    )
    return payload


@router.get("/{simulation_id}/weather")
def get_weather_snapshot(simulation_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """Return the stored weather snapshot used by a simulation."""
    from ..models import WeatherSnapshot

    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    if not simulation.weather_snapshot_id:
        raise HTTPException(
            status_code=404,
            detail="This simulation was run against a stored synthetic scenario, not a live weather snapshot.",
        )
    snapshot = db.get(WeatherSnapshot, simulation.weather_snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Weather snapshot not found")
    return {
        "id": snapshot.id,
        "location_name": snapshot.location_name,
        "latitude": snapshot.latitude,
        "longitude": snapshot.longitude,
        "timezone": snapshot.timezone,
        "weather_source": snapshot.weather_source,
        "retrieved_at": snapshot.retrieved_at,
        "source_timestamp": snapshot.source_timestamp,
        "weather_type": snapshot.weather_type,
        "forecast_date": snapshot.forecast_date,
        "current_conditions": snapshot.current_conditions,
        "hourly_conditions": snapshot.hourly_conditions,
        "requested_hours": snapshot.requested_hours,
        "units": snapshot.units,
    }


@router.post("/{simulation_id}/optimize")
def optimize_policies(simulation_id: str, payload: OptimizeRequest, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    if simulation.status != "completed":
        raise HTTPException(status_code=409, detail="Optimisation requires a completed simulation")
    try:
        outcome = svc.run_optimization(
            db,
            simulation,
            candidate_count=payload.candidate_count,
            seed=payload.seed,
            constraints=payload.constraints,
            population_size=payload.population_size,
        )
    except svc.SimulationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return optimization_payload(
        simulation, outcome.candidates, outcome.frontier, outcome.ranges,
        outcome.constraints, outcome.generated, outcome.evaluated, outcome.feasible,
        outcome.notes, outcome.seed,
    )


@router.get("/{simulation_id}/pareto")
def get_pareto(simulation_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    stored = svc.stored_optimization(db, simulation)
    if stored is None:
        raise HTTPException(
            status_code=404,
            detail="No optimisation has been run for this simulation. POST /optimize first.",
        )
    return stored


@router.post("/{simulation_id}/apply", status_code=201)
def apply_candidate(simulation_id: str, payload: ApplyCandidateRequest, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """Create a policy from a stored Pareto candidate and optionally re-run."""
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    stored = svc.stored_optimization(db, simulation)
    if stored is None:
        raise HTTPException(status_code=404, detail="No optimisation available for this simulation")

    candidate = next((c for c in stored["candidates"] if c["id"] == payload.candidate_id), None)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found in this optimisation run")

    base_policy = db.get(Policy, simulation.policy_id)
    if base_policy is None:
        raise HTTPException(status_code=404, detail="Base policy not found")

    policy_dict = candidate_to_policy_dict(candidate, base_policy)
    # Unique, traceable policy name per application.
    policy_dict["name"] = f"{policy_dict['name']} · {simulation.id[:6]}"
    policy = Policy(organization_id=simulation.organization_id, **policy_dict)
    db.add(policy)
    db.commit()
    db.refresh(policy)

    if not payload.run_simulation:
        return {"policy": serializers.policy_payload(policy), "simulation": None, "results": None}

    try:
        executed = svc.run_for_ids(
            db,
            organization_id=simulation.organization_id,
            policy_id=policy.id,
            scenario_id=simulation.scenario_id,
            population_size=payload.population_size,
            random_seed=simulation.random_seed,
            simulation_duration_days=int(
                (simulation.configuration or {}).get("simulation_duration_days", 1)
            ),
            label=f"{candidate['label']} (applied from {simulation.id[:8]})",
            include_saved_workers=bool(
                (simulation.configuration or {}).get("include_saved_workers", True)
            ),
        )
    except svc.SimulationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return {
        "policy": serializers.policy_payload(policy),
        "simulation": serializers.simulation_payload(executed.simulation),
        "results": executed.results,
    }


@router.get("/{simulation_id}/report")
def download_report(simulation_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """Generate the PDF report on demand and record it in the reports table."""
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    if simulation.status != "completed":
        raise HTTPException(status_code=409, detail="Only completed simulations can be reported")

    result = svc.latest_result(db, simulation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No results stored for this simulation")

    org = db.get(Organization, simulation.organization_id)
    payload = serializers.results_payload(simulation, result)
    optimization = svc.stored_optimization(db, simulation)
    frontier = optimization["frontier"] if optimization else None
    recommendations = (simulation.summary or {}).get("recommendations") or insights.build_recommendations(
        payload["metrics"], payload["policy"] or {}, payload["scenario"] or {}
    )

    pdf = reports.build_report_pdf(
        organization_name=org.name if org else "HeatFair organization",
        simulation_id=simulation.id,
        model_version=simulation.model_version,
        created_at=simulation.created_at,
        policy=payload["policy"] or {},
        scenario=payload["scenario"] or {},
        metrics=payload["metrics"],
        baseline=payload["metrics"].get("baseline"),
        results=payload,
        frontier=frontier,
        recommendations=recommendations,
        weather=payload.get("weather"),
    )

    settings = get_settings()
    timestamp = simulation.created_at.strftime("%Y%m%d-%H%M%S") if simulation.created_at else "report"
    filename = f"heatfair-{simulation.id[:8]}-{timestamp}.pdf"
    path = Path(settings.reports_path) / filename
    path.write_bytes(pdf)

    report_url = f"{settings.api_prefix}/reports/download/{filename}"
    db.add(Report(simulation_id=simulation.id, report_url=report_url, title=f"Policy report · {simulation.id[:8]}"))
    db.commit()

    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=filename,
    )
