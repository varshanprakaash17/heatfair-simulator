"""Shared pytest fixtures.

A throwaway SQLite database is configured before the application package is
imported so tests never touch the demo database.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

_TEST_DB = Path(tempfile.gettempdir()) / f"heatfair_test_{uuid.uuid4().hex}.db"
os.environ["HEATFAIR_DB_OVERRIDE"] = f"sqlite:///{_TEST_DB.as_posix()}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.engine.incentive import PolicySpec  # noqa: E402
from app.engine.scenario import ScenarioSpec  # noqa: E402
from app.engine.workers import WorkerPopulation, generate_workers  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def population() -> WorkerPopulation:
    return generate_workers(size=250, seed=42)


@pytest.fixture
def policy() -> PolicySpec:
    return PolicySpec(
        name="Test policy",
        deadline_pressure=0.5,
        bonus_dependency=0.5,
        penalty_severity=0.4,
        break_compensation=0.5,
        protected_break_minutes=60,
        flexible_deadlines=True,
        budget_limit=25,
    )


@pytest.fixture
def scenario() -> ScenarioSpec:
    return ScenarioSpec(
        name="Test hot scenario",
        temperature=34,
        humidity=62,
        work_duration=8,
        work_intensity="heavy",
        shift_start_hour=6,
    )


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def pytest_sessionfinish(session, exitstatus):  # pragma: no cover - cleanup helper
    try:
        _TEST_DB.unlink(missing_ok=True)
    except OSError:
        pass
