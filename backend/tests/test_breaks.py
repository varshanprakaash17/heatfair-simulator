import numpy as np
import pytest

from app.engine.breaks import (
    break_accessibility,
    break_accessibility_explained,
    protected_availability,
)
from app.engine.incentive import PolicySpec


def _policy(**overrides) -> PolicySpec:
    base = {
        "deadline_pressure": 0.5,
        "bonus_dependency": 0.5,
        "penalty_severity": 0.4,
        "break_compensation": 0.5,
        "protected_break_minutes": 60.0,
        "flexible_deadlines": True,
    }
    base.update(overrides)
    return PolicySpec(**base)


def test_availability_scales_with_entitlement():
    assert protected_availability(0, 8)[0] == pytest.approx(0.0)
    assert protected_availability(72, 8)[0] == pytest.approx(1.0)
    assert protected_availability(200, 8)[0] == pytest.approx(1.0)


def test_accessibility_is_bounded_probability():
    policy = _policy()
    values = break_accessibility(
        policy,
        shift_hours=np.array([4.0, 8.0, 12.0]),
        workload=np.array([0.0, 0.5, 1.0]),
        work_intensity=np.array([0.2, 0.6, 1.0]),
        incentive_pressure=np.array([0.0, 0.5, 1.0]),
    )
    assert np.all(values > 0) and np.all(values < 1)
    assert np.isfinite(values).all()


def test_longer_protected_breaks_increase_accessibility():
    low = break_accessibility(_policy(protected_break_minutes=0), 8, 0.5, 0.6, 0.4)[0]
    high = break_accessibility(_policy(protected_break_minutes=90), 8, 0.5, 0.6, 0.4)[0]
    assert high > low


def test_compensation_increases_accessibility():
    unpaid = break_accessibility(_policy(break_compensation=0.0), 8, 0.5, 0.6, 0.5)[0]
    paid = break_accessibility(_policy(break_compensation=1.0), 8, 0.5, 0.6, 0.5)[0]
    assert paid > unpaid


def test_incentive_pressure_reduces_accessibility():
    low = break_accessibility(_policy(), 8, 0.5, 0.6, 0.05)[0]
    high = break_accessibility(_policy(), 8, 0.5, 0.6, 0.95)[0]
    assert high < low


def test_workload_reduces_accessibility():
    low = break_accessibility(_policy(), 8, 0.1, 0.3, 0.4)[0]
    high = break_accessibility(_policy(), 8, 0.95, 1.0, 0.4)[0]
    assert high < low


def test_extreme_inputs_stay_finite():
    extreme = break_accessibility(
        _policy(protected_break_minutes=0, break_compensation=0),
        shift_hours=np.array([0.25]),
        workload=np.array([1.0]),
        work_intensity=np.array([1.0]),
        incentive_pressure=np.array([1.0]),
    )
    assert np.isfinite(extreme).all()
    assert 0.0 < float(extreme[0]) < 1.0


def test_explanation_reconstructs_logistic_value():
    policy = _policy()
    explained = break_accessibility_explained(policy, 8, 0.6, 0.7, 0.5)
    direct = break_accessibility(policy, 8, 0.6, 0.7, 0.5)[0]
    assert explained["accessibility"] == pytest.approx(round(float(direct), 4), abs=1e-3)
    assert pytest.approx(sum(explained["terms"].values()), abs=1e-4) == explained["z"]
