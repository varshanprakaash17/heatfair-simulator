import numpy as np
import pytest

from app.engine.income import compute_income
from app.engine.incentive import PolicySpec


def _policy(**overrides) -> PolicySpec:
    base = {
        "deadline_pressure": 0.5,
        "bonus_dependency": 0.5,
        "penalty_severity": 0.4,
        "break_compensation": 1.0,
        "protected_break_minutes": 60.0,
        "flexible_deadlines": True,
    }
    base.update(overrides)
    return PolicySpec(**base)


def test_full_protection_retains_most_income():
    result = compute_income(
        _policy(),
        hourly_income=np.array([12.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([0.9]),
    )
    assert result.income_retention[0] > 95
    assert result.income_retention[0] <= 100.5


def test_no_breaks_no_penalty_is_neutral():
    result = compute_income(
        _policy(protected_break_minutes=0, break_compensation=0),
        hourly_income=np.array([12.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([1.0]),
    )
    assert result.income_retention[0] == pytest.approx(100.0, abs=0.5)
    assert result.income_loss_abs[0] == pytest.approx(0.0, abs=0.01)


def test_uncompensated_breaks_reduce_retention():
    unpaid = compute_income(
        _policy(break_compensation=0.0),
        hourly_income=np.array([12.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([0.8]),
    )
    paid = compute_income(
        _policy(break_compensation=1.0),
        hourly_income=np.array([12.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([0.8]),
    )
    assert paid.income_retention[0] > unpaid.income_retention[0]


def test_penalty_reduces_income_when_deadlines_are_rigid():
    flexible = compute_income(
        _policy(flexible_deadlines=True, penalty_severity=1.0),
        hourly_income=np.array([12.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([0.6]),
    )
    rigid = compute_income(
        _policy(flexible_deadlines=False, penalty_severity=1.0),
        hourly_income=np.array([12.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([0.6]),
    )
    assert rigid.income_retention[0] < flexible.income_retention[0]


def test_retention_matches_ratio_of_incomes():
    result = compute_income(
        _policy(break_compensation=0.5, protected_break_minutes=45),
        hourly_income=np.array([15.0, 22.5]),
        shift_hours=np.array([8.0, 6.0]),
        accessibility=np.array([0.7, 0.4]),
    )
    expected = result.alternative_income / result.baseline_income * 100
    assert np.allclose(result.income_retention, expected, atol=1e-6)


def test_no_double_counting_bonus_and_break_pay():
    policy = _policy(break_compensation=1.0, protected_break_minutes=60)
    result = compute_income(
        policy,
        hourly_income=np.array([20.0]),
        shift_hours=np.array([8.0]),
        accessibility=np.array([1.0]),
    )
    components = result.components
    # One hour is protected and paid at 100%, so total gross pay cannot exceed
    # the baseline wage plus the performance bonus on worked hours.
    base_wage = 20.0 * 7.0
    break_pay = components["break_pay"][0]
    bonus = components["bonus_alternative"][0]
    assert break_pay == pytest.approx(20.0, rel=1e-6)
    assert bonus == pytest.approx(7.0 * 20.0 * 0.15 * policy.bonus_dependency, rel=1e-6)
    assert result.alternative_income[0] == pytest.approx(base_wage + break_pay + bonus, rel=1e-6)


def test_zero_hour_shift_does_not_divide_by_zero():
    result = compute_income(
        _policy(),
        hourly_income=np.array([0.0]),
        shift_hours=np.array([0.0]),
        accessibility=np.array([0.0]),
    )
    assert np.isfinite(result.income_retention).all()
    assert result.baseline_income[0] > 0


def test_retention_bounded():
    result = compute_income(
        _policy(break_compensation=1.0),
        hourly_income=np.array([10.0] * 5),
        shift_hours=np.array([4.0, 6.0, 8.0, 10.0, 12.0]),
        accessibility=np.array([0.0, 0.25, 0.5, 0.75, 1.0]),
    )
    assert np.all(result.income_retention >= 0)
    assert np.all(result.income_retention <= 200)
