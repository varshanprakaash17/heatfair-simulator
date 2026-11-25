from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import Organization, OrganizationMember, User
from ..schemas import OrganizationCreate, OrganizationOut

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationOut, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.execute(select(Organization).where(Organization.name == payload.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="An organization with this name already exists")
    org = Organization(name=payload.name.strip())
    db.add(org)
    db.flush()
    db.add(OrganizationMember(user_id=user.id, organization_id=org.id, role='owner'))
    db.commit()
    db.refresh(org)
    return org


@router.get("", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.execute(select(Organization).join(OrganizationMember).where(OrganizationMember.user_id == user.id).order_by(Organization.created_at)).scalars().all()


@router.get("/{organization_id}", response_model=OrganizationOut)
def get_organization(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    org = db.execute(select(Organization).join(OrganizationMember).where(Organization.id == organization_id, OrganizationMember.user_id == user.id)).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org
