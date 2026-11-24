"""Simulation orchestrator.

Ties the sub-models together for a worker population under one policy and one
climate scenario. Model order matters: incentive pressure drives break
accessibility, which drives income, exposure and operational impact.

Everything is pure NumPy and deterministic for a given
(population, policy, scenario, seed, model version).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .aggregator import aggregate, summarize
from .breaks import break_accessibility, break_accessibility_explained
from .constants import (
    BREAK_LOGISTIC,
    EXPOSURE_REFERENCE_C,
    INCENTIVE_WEIGHTS,
    INTENSITY_MULTIPLIER_MAX,
    INTENSITY_MULTIPLIER_MIN,
    MODEL_VERSION,
    OPERATIONAL_WEIGHTS,
    PENALTY_RATE,
    PERFORMANCE_BONUS_RATE,
    UNPAID_REST_ALLOWANCE_HOURS,
)
from .exposure import ExposureSettings, compute_exposure
from .income import compute_income
from .incentive import PolicySpec, incentive_breakdown, incentive_index, incentive_pressure
from .operational import operational_disruption, policy_cost_per_shift
from .scenario import ScenarioSpec, scenario_hourly_conditions
from .workers import WorkerPopulation, generate_workers

BASELINE_POLICY_NOTE = (
    "Baseline = the same policy with all protection removed (0 protected break minutes, "
    "0% break compensation, no flexible deadlines). Incentive levels are unchanged so the "
    "comparison isolates the effect of protection measures."
)


@dataclass
class SimulationRequest:
    policy: PolicySpec
    scenario: ScenarioSpec
    workers: WorkerPopulation
    seed: int = 42
    simulation_duration_days: int = 1
    settings: ExposureSettings = field(default_factory=ExposureSettings)


def _evaluate(policy: PolicySpec, scenario: ScenarioSpec, population: WorkerPopulation) -> dict:
    """Run every sub-model for one policy/scenario/population triple."""
    policy = policy.clamped()
    conditions, origin = scenario_hourly_conditions(scenario)

    # A contractual maximum shift length caps longer synthetic shifts for this
    # evaluation. This is a policy constraint, not a change to worker records.
    shift_hours = np.minimum(
        np.asarray(population.shift_hours, dtype=float), float(policy.max_shift_hours)
    )

    # 1. Policy-level incentive pressure, then per-worker effective pressure.
    ip_policy = incentive_index(policy)
    effective_ip = np.clip(
        incentive_pressure(policy, population.incentive_sensitivity), 0.0, 1.0
    )
    # Penalising approved safety-related delays removes a deterrent to taking
    # heat rest; this adds a small effective-pressure increment to behaviour
    # sub-models while leaving the published pressure index formula unchanged.
    if policy.penalise_safety_delays:
        effective_ip = np.clip(effective_ip + 0.05, 0.0, 1.0)

    # 2. Break accessibility (logistic).
    access = break_accessibility(
        policy,
        shift_hours=shift_hours,
        workload=population.workload,
        work_intensity=population.work_intensity,
        incentive_pressure=effective_ip,
    )

    # 3. Income (protected + unpaid rest, no double counting).
    income = compute_income(
        policy,
        hourly_income=population.hourly_income,
        shift_hours=shift_hours,
        accessibility=access,
        break_need=population.break_need,
    )

    # 4. Exposure: shift hours minus protected break hours actually taken.
    protected_hours = np.minimum(policy.protected_break_minutes / 60.0, shift_hours * 0.5)
    exposure_hours = np.maximum(
        shift_hours - protected_hours * access - income.unprotected_rest_hours, 0.5
    )
    exposure = compute_exposure(
        conditions,
        work_intensity=population.work_intensity,
        shift_hours=shift_hours,
        heat_tolerance=population.heat_tolerance,
        exposure_hours=exposure_hours,
        accessibility=access,
        flexible_deadlines=policy.flexible_deadlines,
    )

    # 5. Operational impact uses both protected and unpaid rest hours.
    op = operational_disruption(
        policy,
        shift_hours=shift_hours,
        workload=population.workload,
        accessibility=access,
        unprotected_rest_hours=income.unprotected_rest_hours,
    )

    cost = policy_cost_per_shift(
        policy,
        mean_hourly_income=float(np.mean(population.hourly_income)),
        shift_hours=float(np.mean(shift_hours)),
    )

    metrics = aggregate(
        exposure_index=exposure.exposure_index,
        accessibility=access,
        income_retention=income.income_retention,
        income_loss_abs=income.income_loss_abs,
        disruption_index=op["disruption_index"],
        efficiency=op["efficiency"],
        unprotected_rest_hours=income.unprotected_rest_hours,
        incentive_index=ip_policy,
        policy_cost=cost,
    )
    metrics["exposure_excess_degree_hours"] = round(float(np.mean(exposure.exposure_raw)), 3)
    metrics["operational_coverage_loss"] = round(float(np.mean(op["coverage_loss"])), 3)
    metrics["operational_availability_loss"] = round(float(np.mean(op["availability_loss"])), 3)

    hourly = []
    for i, cond in enumerate(conditions):
        hourly.append(
            {
                "index": i,
                "hour": cond.hour,
                "label": f"{cond.hour:02d}:00",
                "heat_index": round(float(exposure.hourly_heat_index[i]), 2),
                "excess_heat": round(float(exposure.hourly_excess[i]), 2),
                "duration_hours": round(float(exposure.hourly_duration[i]), 3),
                "contribution": round(
                    float(exposure.hourly_duration[i] * exposure.hourly_excess[i]), 3
                ),
            }
        )

    return {
        "policy": policy,
        "conditions_origin": origin,
        "conditions": conditions,
        "metrics": metrics,
        "exposure": exposure,
        "access": access,
        "income": income,
        "operational": op,
        "cost": cost,
        "hourly": hourly,
        "effective_incentive_pressure": effective_ip,
    }


def _baseline_summary(policy: PolicySpec, scenario: ScenarioSpec, population: WorkerPopulation) -> dict:
    baseline_policy = PolicySpec(
        name=f"{policy.name} (no protection baseline)",
        deadline_pressure=policy.deadline_pressure,
        bonus_dependency=policy.bonus_dependency,
        penalty_severity=policy.penalty_severity,
        break_compensation=0.0,
        protected_break_minutes=0.0,
        flexible_deadlines=False,
        paid_breaks=False,
        penalise_safety_delays=policy.penalise_safety_delays,
        max_shift_hours=policy.max_shift_hours,
        budget_limit=policy.budget_limit,
    )
    result = _evaluate(baseline_policy, scenario, population)
    return {
        "label": baseline_policy.name,
        "note": BASELINE_POLICY_NOTE,
        "exposure_index": result["metrics"]["exposure_index"],
        "break_accessibility": result["metrics"]["break_accessibility"],
        "income_retention": result["metrics"]["income_retention"],
        "income_loss_per_worker_shift": result["metrics"]["income_loss_per_worker_shift"],
        "operational_disruption": result["metrics"]["operational_disruption"],
        "operational_efficiency": result["metrics"]["operational_efficiency"],
        "policy_cost_per_worker_shift": result["cost"]["total_cost_per_worker_shift"],
    }


def run_simulation(request: SimulationRequest) -> dict:
    """Execute a full simulation and return a serialisable result bundle."""
    policy = request.policy.clamped()
    scenario = request.scenario
    population = request.workers

    if population.size == 0:
        raise ValueError("Worker population is empty")

    main = _evaluate(policy, scenario, population)

    by_occupation: dict[str, dict] = {}
    occupation_array = np.array(population.occupations)
    for occ in sorted(set(population.occupations)):
        mask = occupation_array == occ
        by_occupation[occ] = {
            "workers": int(mask.sum()),
            "exposure_index": round(float(np.mean(main["exposure"].exposure_index[mask])), 2),
            "income_retention": round(float(np.mean(main["income"].income_retention[mask])), 2),
            "break_accessibility": round(float(np.mean(main["access"][mask]) * 100.0), 2),
            "operational_disruption": round(
                float(np.mean(main["operational"]["disruption_index"][mask])), 2
            ),
        }

    baseline = _baseline_summary(policy, scenario, population)
    metrics = dict(main["metrics"])
    metrics["baseline"] = baseline
    metrics["delta_vs_baseline"] = {
        "exposure_index": round(metrics["exposure_index"] - baseline["exposure_index"], 3),
        "break_accessibility": round(
            metrics["break_accessibility"] - baseline["break_accessibility"], 3
        ),
        "income_retention": round(metrics["income_retention"] - baseline["income_retention"], 3),
        "operational_disruption": round(
            metrics["operational_disruption"] - baseline["operational_disruption"], 3
        ),
        "operational_efficiency": round(
            metrics["operational_efficiency"] - baseline["operational_efficiency"], 3
        ),
    }

    assumptions = {
        "model_version": MODEL_VERSION,
        "population": population.summary(),
        "scenario": {
            "name": scenario.name,
            "temperature_c": scenario.temperature,
            "relative_humidity": scenario.humidity,
            "work_duration_hours": scenario.work_duration,
            "work_intensity": scenario.work_intensity,
            "hourly_conditions_origin": main["conditions_origin"],
            "source": scenario.source,
            "location": scenario.location,
            "shift_start_hour": scenario.shift_start_hour,
        },
        "policy": {
            "name": policy.name,
            "deadline_pressure": policy.deadline_pressure,
            "bonus_dependency": policy.bonus_dependency,
            "penalty_severity": policy.penalty_severity,
            "break_compensation": policy.break_compensation,
            "protected_break_minutes": policy.protected_break_minutes,
            "flexible_deadlines": policy.flexible_deadlines,
            "paid_breaks": policy.paid_breaks,
            "penalise_safety_delays": policy.penalise_safety_delays,
            "max_shift_hours": policy.max_shift_hours,
            "budget_limit": policy.budget_limit,
        },
        "exposure_model": main["exposure"].assumptions,
        "incentive_model": {
            "weights": INCENTIVE_WEIGHTS,
            "formula": "IP = w_deadline*deadline + w_bonus*bonus + w_penalty*penalty + w_break*(1-compensation)",
            "breakdown": incentive_breakdown(policy),
        },
        "break_model": {
            "formula": "A = 1/(1+exp(-z))",
            "coefficients": BREAK_LOGISTIC,
            "example_worker": break_accessibility_explained(
                policy,
                shift_hours=float(np.mean(population.shift_hours)),
                workload=float(np.mean(population.workload)),
                work_intensity=float(np.mean(population.work_intensity)),
                incentive=float(np.mean(main["effective_incentive_pressure"])),
            ),
            "label": "Coefficients are illustrative assumptions, not validated behavioural constants.",
        },
        "income_model": {
            "formula": "alternative = wage*worked_hours + break_pay + bonus_alt - penalty",
            "performance_bonus_rate": PERFORMANCE_BONUS_RATE,
            "penalty_rate": PENALTY_RATE,
            "unpaid_rest_allowance_hours": UNPAID_REST_ALLOWANCE_HOURS,
            "no_double_counting": "bonus computed on base wage of worked hours only; penalty on base shift pay only",
        },
        "operational_model": {
            "weights": OPERATIONAL_WEIGHTS,
            "formula": "disruption = 0.60*coverage_loss + 0.25*workload_pressure + 0.15*availability_loss",
        },
        "constants": {
            "exposure_reference_c": EXPOSURE_REFERENCE_C,
            "intensity_multiplier_range": [INTENSITY_MULTIPLIER_MIN, INTENSITY_MULTIPLIER_MAX],
        },
        "random_seed": request.seed,
        "simulation_duration_days": request.simulation_duration_days,
        "data_provenance": {
            "workers": "synthetic, generated from documented distributions",
            "climate": (
                "Open-Meteo modelled hourly forecast for the selected work window"
                if scenario.source == "open-meteo"
                else (
                    "scenario hourly conditions supplied by the scenario"
                    if main["conditions_origin"] == "scenario_hourly_conditions"
                    else "synthetic diurnal profile derived from the scenario mean"
                )
            ),
            "source": scenario.source,
        },
    }

    limitations = [
        "All worker profiles are synthetic. No real workforce data is used.",
        "Exposure uses a heat-index estimate, not WBGT, and ignores solar load, wind, clothing and acclimatisation physiology.",
        "Live weather is modelled forecast data for the provider's grid cell, not an on-site sensor measurement; future hours are forecasts, not observations.",
        "Break accessibility is a logistic behavioural assumption with no empirical calibration.",
        "Income and operational models are transparent accounting-style formulas, not econometric estimates.",
        "Results are comparative and illustrative; they are not medical advice, injury-prevention guidance or certified occupational-safety assessment.",
        "Cost figures are illustrative and exclude overtime, recruitment and contract penalties.",
    ]

    return {
        "model_version": MODEL_VERSION,
        "metrics": metrics,
        "hourly": main["hourly"],
        "by_occupation": by_occupation,
        "policy": assumptions["policy"],
        "scenario": assumptions["scenario"],
        "workers_summary": population.summary(),
        "assumptions": assumptions,
        "limitations": limitations,
        "reproducibility": {
            "random_seed": request.seed,
            "population_size": population.size,
            "model_version": MODEL_VERSION,
            "deterministic": True,
        },
        "charts": {
            "hourly_exposure": main["hourly"],
            "income_distribution": metrics["income_retention_distribution"],
            "exposure_distribution": metrics["exposure_distribution"],
            "by_occupation": by_occupation,
        },
    }


def quick_evaluate(
    policy: PolicySpec,
    scenario: ScenarioSpec,
    population: WorkerPopulation | None = None,
    seed: int = 42,
    workers: int = 300,
) -> dict:
    """Evaluate a policy without the baseline pass. Used by the optimiser.

    Returns flat objective values in their natural units, never scaled.
    """
    pop = population or generate_workers(workers, seed)
    result = _evaluate(policy, scenario, pop)
    m = result["metrics"]
    return {
        "exposure": m["exposure_index"],
        "income_loss": round(100.0 - m["income_retention"], 4),
        "disruption": m["operational_disruption"],
        "income_retention": m["income_retention"],
        "break_accessibility": m["break_accessibility"],
        "operational_efficiency": m["operational_efficiency"],
        "cost_per_worker_shift": result["cost"]["total_cost_per_worker_shift"],
        "within_budget": result["cost"]["within_budget"],
        "budget_limit": result["cost"]["budget_limit"],
        "income_loss_abs": m["income_loss_per_worker_shift"],
        "exposure_stats": m["exposure_stats"],
    }
