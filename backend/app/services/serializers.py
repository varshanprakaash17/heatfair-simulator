"""Serialisation helpers shared by the API routers."""

from __future__ import annotations

from datetime import date, datetime

import numpy as np

from ..engine.incentive import PolicySpec, incentive_index
from ..engine.scenario import ScenarioSpec, hourly_series
from ..models import Policy, Scenario, Simulation

def json_safe(value):
    """Recursively convert values that JSON columns cannot serialise.

    The API returns datetimes normally, but payloads written into SQLite/Postgres
    JSON columns must be plain JSON types.
    """
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return [json_safe(item) for item in value.tolist()]
    return value


METRIC_KEYS = (
    "exposure_index",
    "break_accessibility",
    "income_retention",
    "operational_disruption",
    "operational_efficiency",
    "incentive_pressure_index",
)


def policy_spec(policy: Policy) -> PolicySpec:
    return PolicySpec(
        name=policy.name,
        deadline_pressure=policy.deadline_pressure,
        bonus_dependency=policy.bonus_dependency,
        penalty_severity=policy.penalty_severity,
        break_compensation=policy.break_compensation,
        protected_break_minutes=policy.protected_break_minutes,
        flexible_deadlines=policy.flexible_deadlines,
        paid_breaks=getattr(policy, "paid_breaks", True),
        penalise_safety_delays=getattr(policy, "penalise_safety_delays", False),
        max_shift_hours=getattr(policy, "max_shift_hours", 10.0),
        budget_limit=policy.budget_limit,
    )


def scenario_spec(scenario: Scenario) -> ScenarioSpec:
    return ScenarioSpec(
        name=scenario.name,
        temperature=scenario.temperature,
        humidity=scenario.humidity,
        work_duration=scenario.work_duration,
        work_intensity=scenario.work_intensity,
        hourly_conditions=scenario.hourly_conditions,
        location=scenario.location,
        source=scenario.source,
        shift_start_hour=scenario.shift_start_hour,
    )


def policy_payload(policy: Policy) -> dict:
    return {
        "id": policy.id,
        "organization_id": policy.organization_id,
        "name": policy.name,
        "deadline_pressure": policy.deadline_pressure,
        "bonus_dependency": policy.bonus_dependency,
        "penalty_severity": policy.penalty_severity,
        "break_compensation": policy.break_compensation,
        "protected_break_minutes": policy.protected_break_minutes,
        "flexible_deadlines": policy.flexible_deadlines,
        "paid_breaks": getattr(policy, "paid_breaks", True),
        "penalise_safety_delays": getattr(policy, "penalise_safety_delays", False),
        "max_shift_hours": getattr(policy, "max_shift_hours", 10.0),
        "budget_limit": policy.budget_limit,
        "created_at": policy.created_at,
        "incentive_pressure_index": incentive_index(policy_spec(policy)),
    }


def scenario_payload(scenario: Scenario, with_preview: bool = True) -> dict:
    spec = scenario_spec(scenario)
    return {
        "id": scenario.id,
        "name": scenario.name,
        "temperature": scenario.temperature,
        "humidity": scenario.humidity,
        "work_duration": scenario.work_duration,
        "work_intensity": scenario.work_intensity,
        "shift_start_hour": scenario.shift_start_hour,
        "hourly_conditions": scenario.hourly_conditions,
        "location": scenario.location,
        "source": scenario.source,
        "created_at": scenario.created_at,
        "hourly_preview": hourly_series(spec) if with_preview else [],
    }


def simulation_payload(simulation: Simulation) -> dict:
    return {
        "id": simulation.id,
        "organization_id": simulation.organization_id,
        "policy_id": simulation.policy_id,
        "scenario_id": simulation.scenario_id,
        "weather_snapshot_id": simulation.weather_snapshot_id,
        "status": simulation.status,
        "model_version": simulation.model_version,
        "random_seed": simulation.random_seed,
        "configuration": simulation.configuration or {},
        "summary": simulation.summary or {},
        "error": simulation.error,
        "duration_ms": simulation.duration_ms,
        "created_at": simulation.created_at,
    }


def results_payload(simulation: Simulation, result) -> dict:
    stored = (result.metrics if result else {}) or {}
    metrics = stored.get("metrics", stored)
    return {
        "simulation_id": simulation.id,
        "status": simulation.status,
        "model_version": simulation.model_version,
        "policy": stored.get("policy"),
        "scenario": stored.get("scenario"),
        "metrics": metrics,
        "charts": stored.get("charts"),
        "hourly": stored.get("hourly"),
        "by_occupation": stored.get("by_occupation"),
        "workers_summary": stored.get("workers_summary"),
        "weather": stored.get("weather"),
        "limitations": stored.get("limitations", []),
        "reproducibility": stored.get("reproducibility"),
        "assumptions": (result.assumptions if result else {}) or {},
        "duration_ms": simulation.duration_ms,
        "created_at": result.created_at if result else simulation.created_at,
    }
