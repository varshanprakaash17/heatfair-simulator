from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Organization
from ..schemas import OrganizationCreate, OrganizationOut

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationOut, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db)):
    existing = db.execute(select(Organization).where(Organization.name == payload.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="An organization with this name already exists")
    org = Organization(name=payload.name.strip())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db)):
    return db.execute(select(Organization).order_by(Organization.created_at)).scalars().all()


@router.get("/{organization_id}", response_model=OrganizationOut)
def get_organization(organization_id: str, db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org
