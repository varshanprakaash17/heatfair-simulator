"""Demo dataset: one fictional delivery organisation, 3 policies, 3 scenarios.

All figures are illustrative and clearly labelled as such in the UI and reports.
Seeding is idempotent: it only creates data when the organisation is missing.
"""

from __future__ import annotations

import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    Organization,
    OrganizationMember,
    Policy,
    Scenario,
    Simulation,
    SimulationResult,
    User,
    WorkerProfile,
)
from ..security import hash_password
from ..config import get_settings
from ..engine.constants import MODEL_VERSION
from ..engine.incentive import PolicySpec
from ..engine.scenario import ScenarioSpec
from ..engine.simulation import SimulationRequest, run_simulation
from ..engine.workers import generate_workers
from . import insights

DEMO_POLICIES = [
    {
        "name": "Existing incentive-based policy",
        "deadline_pressure": 0.82,
        "bonus_dependency": 0.85,
        "penalty_severity": 0.7,
        "break_compensation": 0.0,
        "protected_break_minutes": 0.0,
        "flexible_deadlines": False,
        "paid_breaks": False,
        "penalise_safety_delays": True,
        "max_shift_hours": 10.0,
        "budget_limit": 20.0,
    },
    {
        "name": "Protected-break policy",
        "deadline_pressure": 0.45,
        "bonus_dependency": 0.6,
        "penalty_severity": 0.35,
        "break_compensation": 0.5,
        "protected_break_minutes": 60.0,
        "flexible_deadlines": True,
        "paid_breaks": True,
        "penalise_safety_delays": False,
        "max_shift_hours": 9.5,
        "budget_limit": 22.0,
    },
    {
        "name": "Income-protection policy",
        "deadline_pressure": 0.25,
        "bonus_dependency": 0.4,
        "penalty_severity": 0.15,
        "break_compensation": 1.0,
        "protected_break_minutes": 75.0,
        "flexible_deadlines": True,
        "paid_breaks": True,
        "penalise_safety_delays": False,
        "max_shift_hours": 9.0,
        "budget_limit": 30.0,
    },
]

DEMO_SCENARIOS = [
    {
        "name": "Normal working conditions",
        "temperature": 27.0,
        "humidity": 52.0,
        "work_duration": 8.0,
        "work_intensity": "moderate",
        "shift_start_hour": 7,
        "hourly_conditions": None,
        "source": "synthetic",
        "location": {"name": "Riverton (fictional)", "latitude": 12.97, "longitude": 77.59},
    },
    {
        "name": "Hot working conditions",
        "temperature": 34.0,
        "humidity": 62.0,
        "work_duration": 8.0,
        "work_intensity": "heavy",
        "shift_start_hour": 6,
        "hourly_conditions": None,
        "source": "synthetic",
        "location": {"name": "Riverton (fictional)", "latitude": 12.97, "longitude": 77.59},
    },
    {
        "name": "Extreme heat scenario",
        "temperature": 40.0,
        "humidity": 55.0,
        "work_duration": 9.0,
        "work_intensity": "very_heavy",
        "shift_start_hour": 6,
        "hourly_conditions": None,
        "source": "synthetic",
        "location": {"name": "Riverton (fictional)", "latitude": 12.97, "longitude": 77.59},
    },
]


def ensure_bootstrap_admin(db: Session, org: Organization) -> User | None:
    """Create the first owner account when bootstrap credentials are configured.

    A freshly hosted database has no accounts, so nobody can sign in through the
    invite-only flow. When ``BOOTSTRAP_ADMIN_EMAIL`` and ``BOOTSTRAP_ADMIN_PASSWORD``
    are set, that account is created once as an owner of the demo organisation and
    can then invite staff and worker accounts. Unset variables leave the flow off.
    """
    settings = get_settings()
    email = settings.bootstrap_admin_email.strip().lower()
    password = settings.bootstrap_admin_password
    if not email or len(password) < 8:
        return None

    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        return existing

    user = User(email=email, name="Demo owner", password_hash=hash_password(password))
    db.add(user)
    db.flush()
    membership = db.execute(
        select(OrganizationMember).where(
            OrganizationMember.user_id == user.id,
            OrganizationMember.organization_id == org.id,
        )
    ).scalar_one_or_none()
    if membership is None:
        db.add(OrganizationMember(user_id=user.id, organization_id=org.id, role="owner"))
    db.commit()
    return user


def ensure_demo_data(db: Session, worker_batch: int = 500) -> Organization:
    settings = get_settings()
    org = db.execute(
        select(Organization).where(Organization.name == settings.demo_organization_name)
    ).scalar_one_or_none()

    if org is None:
        org = Organization(name=settings.demo_organization_name)
        db.add(org)
        db.flush()

    existing_policies = {
        p.name for p in db.execute(select(Policy).where(Policy.organization_id == org.id)).scalars()
    }
    for spec in DEMO_POLICIES:
        if spec["name"] not in existing_policies:
            db.add(Policy(organization_id=org.id, **spec))

    existing_scenarios = {s.name for s in db.execute(select(Scenario)).scalars()}
    for spec in DEMO_SCENARIOS:
        if spec["name"] not in existing_scenarios:
            db.add(Scenario(**spec))

    db.flush()

    worker_count = db.execute(
        select(WorkerProfile.id).where(WorkerProfile.organization_id == org.id).limit(1)
    ).first()
    if worker_count is None:
        population = generate_workers(worker_batch, seed=42)
        db.add_all(
            [
                WorkerProfile(
                    organization_id=org.id,
                    occupation=rec["occupation"],
                    hourly_income=rec["hourly_income"],
                    work_intensity=rec["work_intensity"],
                    shift_hours=rec["shift_hours"],
                    workload=rec["workload"],
                    incentive_sensitivity=rec["incentive_sensitivity"],
                    break_need=rec["break_need"],
                    heat_tolerance=rec["heat_tolerance"],
                    synthetic=True,
                    synthetic_id=rec["synthetic_id"],
                    batch_seed=42,
                )
                for rec in population.to_records()
            ]
        )

    db.commit()
    db.refresh(org)
    ensure_demo_simulation(db, org)
    return org


def ensure_demo_simulation(db: Session, org: Organization) -> None:
    """Create one real, computed simulation so the dashboard is never empty."""
    existing = db.execute(
        select(Simulation.id).where(
            Simulation.organization_id == org.id, Simulation.status == "completed"
        ).limit(1)
    ).first()
    if existing is not None:
        return

    policy = db.execute(
        select(Policy).where(
            Policy.organization_id == org.id, Policy.name == DEMO_POLICIES[0]["name"]
        )
    ).scalar_one_or_none()
    scenario = db.execute(
        select(Scenario).where(Scenario.name == DEMO_SCENARIOS[1]["name"])
    ).scalar_one_or_none()
    if policy is None or scenario is None:
        return

    population = generate_workers(500, seed=42)
    started = time.perf_counter()
    results = run_simulation(
        SimulationRequest(
            policy=PolicySpec(
                name=policy.name,
                deadline_pressure=policy.deadline_pressure,
                bonus_dependency=policy.bonus_dependency,
                penalty_severity=policy.penalty_severity,
                break_compensation=policy.break_compensation,
                protected_break_minutes=policy.protected_break_minutes,
                flexible_deadlines=policy.flexible_deadlines,
                paid_breaks=policy.paid_breaks,
                penalise_safety_delays=policy.penalise_safety_delays,
                max_shift_hours=policy.max_shift_hours,
                budget_limit=policy.budget_limit,
            ),
            scenario=ScenarioSpec(
                name=scenario.name,
                temperature=scenario.temperature,
                humidity=scenario.humidity,
                work_duration=scenario.work_duration,
                work_intensity=scenario.work_intensity,
                hourly_conditions=scenario.hourly_conditions,
                location=scenario.location,
                source=scenario.source,
                shift_start_hour=scenario.shift_start_hour,
            ),
            workers=population,
            seed=42,
        )
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    metrics = results["metrics"]

    sim = Simulation(
        organization_id=org.id,
        policy_id=policy.id,
        scenario_id=scenario.id,
        status="completed",
        model_version=MODEL_VERSION,
        random_seed=42,
        duration_ms=elapsed_ms,
        configuration={
            "population_size": population.size,
            "population_seed": 42,
            "simulation_duration_days": 1,
            "label": f"Demo baseline · {scenario.name}",
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
            "scenario": {
                "name": scenario.name,
                "temperature_c": scenario.temperature,
                "relative_humidity": scenario.humidity,
                "work_duration_hours": scenario.work_duration,
                "work_intensity": scenario.work_intensity,
                "source": scenario.source,
                "hourly_conditions_origin": results["scenario"]["hourly_conditions_origin"],
                "location": scenario.location,
            },
        },
    )
    db.add(sim)
    db.flush()

    sim.summary = {
        "label": sim.configuration["label"],
        "policy_name": policy.name,
        "scenario_name": scenario.name,
        "population_size": population.size,
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
    }
    results["reproducibility"]["days"] = 1
    db.add(
        SimulationResult(
            simulation_id=sim.id,
            metrics={
                "metrics": metrics,
                "hourly": results["hourly"],
                "by_occupation": results["by_occupation"],
                "charts": results["charts"],
                "policy": results["policy"],
                "scenario": results["scenario"],
                "workers_summary": results["workers_summary"],
                "limitations": results["limitations"],
                "reproducibility": results["reproducibility"],
            },
            assumptions=results["assumptions"],
        )
    )
    db.commit()
