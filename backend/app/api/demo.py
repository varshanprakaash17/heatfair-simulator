from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Organization, Policy, Scenario, Simulation
from ..services.seed import ensure_demo_data
from ..services.serializers import policy_payload, scenario_payload, simulation_payload

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db)):
    """Return the demo organisation and its saved policies/scenarios.

    The frontend calls this once at start-up so the demo works without any
    manual database editing or hard-coded identifiers.
    """
    org = ensure_demo_data(db)
    policies = db.execute(
        select(Policy).where(Policy.organization_id == org.id).order_by(Policy.created_at)
    ).scalars().all()
    scenarios = db.execute(select(Scenario).order_by(Scenario.created_at)).scalars().all()
    latest = db.execute(
        select(Simulation)
        .where(Simulation.organization_id == org.id, Simulation.status == "completed")
        .order_by(Simulation.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    return {
        "is_demo": True,
        "disclaimer": "All organisations, workers and climate values are synthetic and illustrative.",
        "organization": {"id": org.id, "name": org.name, "created_at": org.created_at},
        "policies": [policy_payload(p) for p in policies],
        "scenarios": [scenario_payload(s) for s in scenarios],
        "latest_simulation": simulation_payload(latest) if latest else None,
        "suggested": {
            "policy_id": policies[0].id if policies else None,
            "scenario_id": scenarios[1].id if len(scenarios) > 1 else (scenarios[0].id if scenarios else None),
            "population_size": 500,
            "random_seed": 42,
        },
    }
