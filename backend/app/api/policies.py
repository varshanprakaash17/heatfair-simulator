from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..api.auth import get_optional_user, require_org_membership
from ..db import get_db
from ..models import Policy, User
from ..schemas import PolicyCreate, PolicyUpdate
from ..services.serializers import policy_payload

router = APIRouter(prefix="/policies", tags=["policies"])


@router.post("", status_code=201)
def create_policy(
    payload: PolicyCreate,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    require_org_membership(organization_id=payload.organization_id, user=user, db=db)
    policy = Policy(**payload.model_dump())
    db.add(policy)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="A policy with this name already exists for the organization"
        ) from exc
    db.refresh(policy)
    return policy_payload(policy)


@router.get("")
def list_policies(
    organization_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    stmt = select(Policy).order_by(Policy.created_at)
    if organization_id:
        require_org_membership(organization_id=organization_id, user=user, db=db, allow_public_demo=True)
        stmt = stmt.where(Policy.organization_id == organization_id)
    return [policy_payload(p) for p in db.execute(stmt).scalars().all()]


@router.get("/{policy_id}")
def get_policy(policy_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    policy = db.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy_payload(policy)


@router.put("/{policy_id}")
def update_policy(policy_id: str, payload: PolicyUpdate, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    policy = db.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    require_org_membership(organization_id=policy.organization_id, user=user, db=db)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if value is not None:
            setattr(policy, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Policy name conflicts with an existing policy") from exc
    db.refresh(policy)
    return policy_payload(policy)


@router.delete("/{policy_id}", status_code=204)
def delete_policy(policy_id: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """Delete a policy that is not referenced by any stored simulation."""
    from ..models import Simulation

    policy = db.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    referenced = db.execute(
        select(Simulation.id).where(Simulation.policy_id == policy_id).limit(1)
    ).first()
    if referenced is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "This policy is referenced by a stored simulation. Keep it for audit, "
                "or duplicate it and delete the copy instead."
            ),
        )
    db.delete(policy)
    db.commit()
    return None
