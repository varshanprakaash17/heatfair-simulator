"""Database session management.

SQLite is the default so the demo runs with zero external setup. Point
``DATABASE_URL`` at a PostgreSQL/Supabase connection string to use Postgres;
``database/schema.sql`` contains the equivalent DDL for a Supabase project.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
_connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _record):  # pragma: no cover - driver hook
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (registers mappers)

    Base.metadata.create_all(bind=engine)
    if settings.is_sqlite:
        _migrate_sqlite()


def _migrate_sqlite() -> None:
    """Apply additive column migrations for local demo databases.

    ``create_all`` does not alter existing tables, and the workspace may already
    contain a seeded demo database from an earlier build. These are safe,
    additive ``ALTER TABLE`` statements only; no column is dropped or rewritten.
    """

    additive = {
        "policies": {
            "paid_breaks": "BOOLEAN NOT NULL DEFAULT 1",
            "penalise_safety_delays": "BOOLEAN NOT NULL DEFAULT 0",
            "max_shift_hours": "FLOAT NOT NULL DEFAULT 10.0",
        },
        "simulations": {
            "weather_snapshot_id": "VARCHAR(36)",
        },
        "worker_profiles": {
            "label": "VARCHAR(80)",
        },
    }
    with engine.begin() as conn:
        for table, columns in additive.items():
            existing = {
                row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            }
            for name, ddl in columns.items():
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
