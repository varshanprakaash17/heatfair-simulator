from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..engine.workers import generate_workers
from ..models import Organization, WorkerProfile
from ..schemas import WorkerCreateRequest, WorkerGenerateRequest, WorkerProfileOut, WorkerUpdateRequest

router = APIRouter(prefix="/workers", tags=["workers"])


def _worker_payload(worker: WorkerProfile) -> dict:
    return WorkerProfileOut.model_validate(worker).model_dump(mode="json")


def _require_org(db: Session, organization_id: str) -> Organization:
    org = db.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.post("/generate")
def generate_population(payload: WorkerGenerateRequest, db: Session = Depends(get_db)):
    """Generate (and optionally persist) a synthetic worker population."""
    org = _require_org(db, payload.organization_id)

    try:
        population = generate_workers(size=payload.size, seed=payload.seed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    records = population.to_records()

    if payload.persist:
        # Replace the previous synthetic generation for this organization, but
        # never touch profiles the user added themselves.
        db.execute(
            delete(WorkerProfile).where(
                WorkerProfile.organization_id == org.id,
                WorkerProfile.synthetic.is_(True),
            )
        )
        db.add_all(
            [
                WorkerProfile(
                    organization_id=org.id,
                    occupation=r["occupation"],
                    hourly_income=r["hourly_income"],
                    work_intensity=r["work_intensity"],
                    shift_hours=r["shift_hours"],
                    workload=r["workload"],
                    incentive_sensitivity=r["incentive_sensitivity"],
                    break_need=r["break_need"],
                    heat_tolerance=r["heat_tolerance"],
                    synthetic=True,
                    synthetic_id=r["synthetic_id"],
                    batch_seed=payload.seed,
                )
                for r in records
            ]
        )
        db.commit()

    return {
        "organization_id": org.id,
        "persisted": payload.persist,
        "summary": population.summary(),
        "profiles": records[:12],
        "total_returned": min(len(records), 12),
    }


@router.get("")
def list_workers(
    organization_id: str,
    limit: int = Query(500, ge=1, le=500),
    include_synthetic: bool = Query(True, description="Include generated synthetic profiles"),
    db: Session = Depends(get_db),
):
    """List stored worker profiles, saved profiles first."""
    _require_org(db, organization_id)
    stmt = select(WorkerProfile).where(WorkerProfile.organization_id == organization_id)
    if not include_synthetic:
        stmt = stmt.where(WorkerProfile.synthetic.is_(False))
    workers = (
        db.execute(
            stmt.order_by(WorkerProfile.synthetic, WorkerProfile.synthetic_id).limit(limit)
        )
        .scalars()
        .all()
    )
    synthetic_total = db.execute(
        select(func.count(WorkerProfile.id)).where(
            WorkerProfile.organization_id == organization_id,
            WorkerProfile.synthetic.is_(True),
        )
    ).scalar_one()
    saved_total = db.execute(
        select(func.count(WorkerProfile.id)).where(
            WorkerProfile.organization_id == organization_id,
            WorkerProfile.synthetic.is_(False),
        )
    ).scalar_one()
    return {
        "total": int(synthetic_total) + int(saved_total),
        "synthetic_total": int(synthetic_total),
        "saved_total": int(saved_total),
        "workers": [_worker_payload(w) for w in workers],
    }


@router.post("", status_code=201)
def create_worker(payload: WorkerCreateRequest, db: Session = Depends(get_db)):
    """Add a worker profile that is included in the next simulation."""
    org = _require_org(db, payload.organization_id)

    existing = set(
        db.execute(
            select(WorkerProfile.synthetic_id).where(
                WorkerProfile.organization_id == org.id,
                WorkerProfile.synthetic.is_(False),
            )
        )
        .scalars()
        .all()
    )
    next_number = len(existing) + 1
    while f"S-{next_number:04d}" in existing:
        next_number += 1

    fields = payload.model_dump(exclude={"organization_id"})
    worker = WorkerProfile(
        organization_id=org.id,
        synthetic=False,
        synthetic_id=f"S-{next_number:04d}",
        label=(fields.pop("label") or None),
        **fields,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return _worker_payload(worker)


@router.patch("/{worker_id}")
def update_worker(
    worker_id: str,
    payload: WorkerUpdateRequest,
    organization_id: str = Query(...),
    db: Session = Depends(get_db),
):
    worker = db.get(WorkerProfile, worker_id)
    if worker is None or worker.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Worker profile not found")
    if worker.synthetic:
        raise HTTPException(
            status_code=409,
            detail="Generated synthetic profiles cannot be edited. Add a saved worker profile instead.",
        )

    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is not None:
            setattr(worker, key, value)
    db.commit()
    db.refresh(worker)
    return _worker_payload(worker)


@router.delete("/{worker_id}", status_code=204)
def delete_worker(
    worker_id: str,
    organization_id: str = Query(...),
    db: Session = Depends(get_db),
):
    worker = db.get(WorkerProfile, worker_id)
    if worker is None or worker.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Worker profile not found")
    if worker.synthetic:
        raise HTTPException(
            status_code=409,
            detail="Generated synthetic profiles cannot be deleted individually. Regenerate the batch instead.",
        )
    db.delete(worker)
    db.commit()
    return None
