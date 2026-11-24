from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..engine.constants import MODEL_VERSION

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Liveness + database connectivity check."""
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception as exc:  # noqa: BLE001
        database = f"unavailable: {exc}"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "service": "heatfair-api",
        "version": MODEL_VERSION,
        "database": database,
        "timestamp": datetime.now(timezone.utc),
    }
