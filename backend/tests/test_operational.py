import numpy as np
import pytest

from app.engine.incentive import PolicySpec
from app.engine.operational import operational_disruption, policy_cost_per_shift


def _policy(**overrides) -> PolicySpec:
    base = {
        "deadline_pressure": 0.5,
        "bonus_dependency": 0.5,
        "penalty_severity": 0.4,
        "break_compensation": 0.5,
        "protected_break_minutes": 60.0,
        "flexible_deadlines": False,
        "budget_limit": 20.0,
    }
    base.update(overrides)
    return PolicySpec(**base)


def test_disruption_in_range():
    result = operational_disruption(
        _policy(),
        shift_hours=np.array([8.0, 6.0]),
        workload=np.array([0.5, 0.9]),
        accessibility=np.array([0.7, 0.2]),
        unprotected_rest_hours=np.array([0.1, 0.4]),
    )
    assert np.all(result["disruption_index"] >= 0)
    assert np.all(result["disruption_index"] <= 100)
    assert np.allclose(result["efficiency"], 100 - result["disruption_index"])


def test_flexibility_reduces_disruption():
    args = dict(
        shift_hours=np.array([8.0]),
        workload=np.array([0.6]),
        accessibility=np.array([0.7]),
        unprotected_rest_hours=np.array([0.2]),
    )
    rigid = operational_disruption(_policy(flexible_deadlines=False), **args)
    flexible = operational_disruption(_policy(flexible_deadlines=True), **args)
    assert flexible["disruption_index"][0] < rigid["disruption_index"][0]


def test_more_breaks_increase_disruption_without_flexibility():
    args = dict(
        shift_hours=np.array([8.0]),
        workload=np.array([0.6]),
        accessibility=np.array([0.8]),
        unprotected_rest_hours=np.array([0.1]),
    )
    short = operational_disruption(_policy(protected_break_minutes=30), **args)
    long = operational_disruption(_policy(protected_break_minutes=120), **args)
    assert long["disruption_index"][0] > short["disruption_index"][0]


def test_availability_loss_at_zero_access():
    result = operational_disruption(
        _policy(protected_break_minutes=0),
        shift_hours=np.array([8.0]),
        workload=np.array([0.5]),
        accessibility=np.array([0.0]),
    )
    assert result["availability_loss"][0] == pytest.approx(30.0, abs=1e-6)


def test_cost_within_and_over_budget():
    within = policy_cost_per_shift(_policy(protected_break_minutes=30), 12.0, 8.0)
    over = policy_cost_per_shift(_policy(protected_break_minutes=120, break_compensation=1.0), 30.0, 8.0)
    assert within["within_budget"] is True
    assert over["within_budget"] is False
    assert over["total_cost_per_worker_shift"] > within["total_cost_per_worker_shift"]


def test_cost_components_sum_to_total():
    cost = policy_cost_per_shift(_policy(protected_break_minutes=75), 14.0, 8.0)
    total = cost["break_compensation_cost"] + cost["backfill_cost"]
    assert cost["total_cost_per_worker_shift"] == pytest.approx(total, abs=1e-4)
