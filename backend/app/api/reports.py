from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
def list_reports(simulation_id: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Report).order_by(Report.created_at.desc()).limit(50)
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
def download(filename: str):
    # Only allow files the generator itself created, resolved inside the reports dir.
    settings = get_settings()
    base = Path(settings.reports_path).resolve()
    candidate = (base / filename).resolve()
    if base not in candidate.parents or candidate.suffix.lower() != ".pdf" or not candidate.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path=str(candidate), media_type="application/pdf", filename=candidate.name
    )
