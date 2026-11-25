from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..engine.scenario import ScenarioSpec, hourly_series
from ..models import Scenario
from ..schemas import ScenarioCreate
from ..services.serializers import scenario_payload, scenario_spec

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.post("", status_code=201)
def create_scenario(
    payload: ScenarioCreate,
    db: Session = Depends(get_db),
):
    hourly = [h.model_dump() for h in payload.hourly_conditions] if payload.hourly_conditions else None
    scenario = Scenario(
        name=payload.name.strip(),
        temperature=payload.temperature,
        humidity=payload.humidity,
        work_duration=payload.work_duration,
        work_intensity=payload.work_intensity,
        shift_start_hour=payload.shift_start_hour,
        hourly_conditions=hourly,
        location=payload.location.model_dump() if payload.location else None,
        source=payload.source or ("custom-hourly" if hourly else "synthetic"),
    )
    db.add(scenario)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A scenario with this name already exists") from exc
    db.refresh(scenario)
    return scenario_payload(scenario)


@router.get("")
def list_scenarios(
    db: Session = Depends(get_db),
):
    scenarios = db.execute(select(Scenario).order_by(Scenario.created_at)).scalars().all()
    return [scenario_payload(s) for s in scenarios]


@router.get("/{scenario_id}")
def get_scenario(scenario_id: str, db: Session = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario_payload(scenario)


@router.get("/{scenario_id}/hourly")
def scenario_hourly(scenario_id: str, shift_start_hour: int | None = None, db: Session = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    spec: ScenarioSpec = scenario_spec(scenario)
    if shift_start_hour is not None:
        spec.shift_start_hour = max(0, min(23, shift_start_hour))
    return {"scenario_id": scenario.id, "hourly": hourly_series(spec)}
