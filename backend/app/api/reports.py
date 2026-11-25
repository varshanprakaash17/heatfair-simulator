from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api.auth import get_current_user, require_org_membership
from ..config import get_settings
from ..db import get_db
from ..models import Report, Simulation, User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
def list_reports(organization_id: str = Query(...), simulation_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_membership(organization_id=organization_id, user=user, db=db)
    stmt = select(Report).join(Simulation, Simulation.id == Report.simulation_id).where(Simulation.organization_id == organization_id).order_by(Report.created_at.desc()).limit(50)
    if simulation_id:
        stmt = stmt.where(Report.simulation_id == simulation_id)
    rows = db.execute(stmt).scalars().all()
    return [
        {
            "id": r.id,
            "simulation_id": r.simulation_id,
            "report_url": r.report_url,
            "title": r.title,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/download/{filename}")
def download(filename: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = db.execute(select(Report).where(Report.report_url.like(f"%/{filename}")).limit(1)).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    simulation = db.get(Simulation, report.simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Report not found")
    require_org_membership(organization_id=simulation.organization_id, user=user, db=db)
    # Keep the generated-file path constrained to the reports directory.
    settings = get_settings()
    base = Path(settings.reports_path).resolve()
    candidate = (base / filename).resolve()
    if base not in candidate.parents or candidate.suffix.lower() != ".pdf" or not candidate.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path=str(candidate), media_type="application/pdf", filename=candidate.name
    )
