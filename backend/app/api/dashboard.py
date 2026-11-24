from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Organization, Policy, Scenario, Simulation, SimulationResult, WorkerProfile
from ..services import serializers, simulation_service as svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(
    organization_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Aggregated dashboard payload built entirely from stored simulation data."""
    if organization_id:
        org = db.get(Organization, organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
    else:
        org = db.execute(select(Organization).order_by(Organization.created_at)).scalars().first()
        if org is None:
            raise HTTPException(status_code=404, detail="No organizations exist yet")

    simulations = (
        db.execute(
            select(Simulation)
            .where(Simulation.organization_id == org.id)
            .order_by(Simulation.created_at.desc())
            .limit(12)
        )
        .scalars()
        .all()
    )
    completed = [s for s in simulations if s.status == "completed"]
    latest = completed[0] if completed else None

    latest_results = None
    if latest is not None:
        latest_results = svc.latest_result(db, latest.id)

    synthetic_workers = db.execute(
        select(func.count(WorkerProfile.id)).where(
            WorkerProfile.organization_id == org.id,
            WorkerProfile.synthetic.is_(True),
        )
    ).scalar_one()
    saved_workers = db.execute(
        select(func.count(WorkerProfile.id)).where(
            WorkerProfile.organization_id == org.id,
            WorkerProfile.synthetic.is_(False),
        )
    ).scalar_one()
    policy_count = db.execute(
        select(func.count(Policy.id)).where(Policy.organization_id == org.id)
    ).scalar_one()
    simulation_count = db.execute(
        select(func.count(Simulation.id)).where(Simulation.organization_id == org.id)
    ).scalar_one()
    scenario_count = db.execute(select(func.count(Scenario.id))).scalar_one()

    latest_payload = None
    if latest is not None:
        stored = (latest_results.metrics if latest_results else {}) or {}
        latest_payload = {
            "simulation": serializers.simulation_payload(latest),
            "metrics": stored.get("metrics", {}),
            "hourly": stored.get("hourly", [])[:12],
            "recommendations": (latest.summary or {}).get("recommendations", []),
            "policy": (latest.configuration or {}).get("policy"),
            "scenario": (latest.configuration or {}).get("scenario"),
            "weather": (latest.configuration or {}).get("weather"),
            "optimization": None,
        }
        optimization = svc.stored_optimization(db, latest)
        if optimization:
            latest_payload["optimization"] = {
                "frontier_size": len(optimization["frontier"]),
                "evaluated": optimization["evaluated"],
                "feasible": optimization["feasible"],
                "best_exposure": min(
                    (f["objectives"]["exposure"] for f in optimization["frontier"]), default=None
                ),
                "best_income_loss": min(
                    (f["objectives"]["income_loss"] for f in optimization["frontier"]), default=None
                ),
                "best_disruption": min(
                    (f["objectives"]["disruption"] for f in optimization["frontier"]), default=None
                ),
            }

    recent = [
        {
            "id": s.id,
            "created_at": s.created_at,
            "status": s.status,
            "label": (s.summary or {}).get("label")
            or (s.configuration or {}).get("label")
            or s.id[:8],
            "policy_name": (s.configuration or {}).get("policy", {}).get("name"),
            "scenario_name": (s.configuration or {}).get("scenario", {}).get("name"),
            "population_size": (s.configuration or {}).get("population_size"),
            "exposure_index": (s.summary or {}).get("exposure_index"),
            "income_retention": (s.summary or {}).get("income_retention"),
            "break_accessibility": (s.summary or {}).get("break_accessibility"),
            "operational_efficiency": (s.summary or {}).get("operational_efficiency"),
            "weather_location": (s.summary or {}).get("weather_location"),
            "weather_type": (s.summary or {}).get("weather_type"),
            "duration_ms": s.duration_ms,
        }
        for s in simulations
    ]

    return {
        "organization": {"id": org.id, "name": org.name, "created_at": org.created_at},
        "counts": {
            "synthetic_workers": int(synthetic_workers),
            "saved_workers": int(saved_workers),
            "policies": int(policy_count),
            "scenarios": int(scenario_count),
            "simulations": int(simulation_count),
        },
        "latest": latest_payload,
        "recent_simulations": recent,
        "model_version": latest.model_version if latest else None,
    }
