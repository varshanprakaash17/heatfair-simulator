import numpy as np
import pytest

from app.engine.constants import INCENTIVE_WEIGHTS
from app.engine.incentive import PolicySpec, incentive_breakdown, incentive_index, incentive_pressure


def test_weights_sum_to_one():
    assert pytest.approx(sum(INCENTIVE_WEIGHTS.values()), rel=1e-9) == 1.0


def test_zero_pressure_policy_scores_zero():
    policy = PolicySpec(
        deadline_pressure=0.0,
        bonus_dependency=0.0,
        penalty_severity=0.0,
        break_compensation=1.0,
    )
    assert incentive_index(policy) == pytest.approx(0.0)


def test_maximum_pressure_policy_scores_100():
    policy = PolicySpec(
        deadline_pressure=1.0, bonus_dependency=1.0, penalty_severity=1.0, break_compensation=0.0
    )
    assert incentive_index(policy) == pytest.approx(100.0)


def test_pressure_is_bounded_for_out_of_range_inputs():
    policy = PolicySpec(
        deadline_pressure=3.0, bonus_dependency=-2.0, penalty_severity=5.0, break_compensation=9.0
    )
    assert 0.0 <= incentive_index(policy) <= 100.0


def test_compensation_reduces_pressure():
    base = PolicySpec(deadline_pressure=0.6, bonus_dependency=0.6, penalty_severity=0.6)
    paid = PolicySpec(
        deadline_pressure=0.6, bonus_dependency=0.6, penalty_severity=0.6, break_compensation=1.0
    )
    assert incentive_index(paid) < incentive_index(base)


def test_breakdown_contributions_reconstruct_index():
    policy = PolicySpec(
        deadline_pressure=0.7, bonus_dependency=0.2, penalty_severity=0.9, break_compensation=0.25
    )
    breakdown = incentive_breakdown(policy)
    total = sum(breakdown["contributions"].values())
    assert total == pytest.approx(breakdown["index"], abs=1e-2)
    assert pytest.approx(sum(breakdown["share_of_total"].values()), abs=0.1) == 100.0


def test_worker_sensitivity_scales_pressure():
    policy = PolicySpec(deadline_pressure=0.8, bonus_dependency=0.8, penalty_severity=0.7)
    low = incentive_pressure(policy, np.array([0.0]))[0]
    high = incentive_pressure(policy, np.array([1.0]))[0]
    assert high > low
    assert 0 <= low <= 1 and 0 <= high <= 1


def test_deterministic_output():
    policy = PolicySpec(deadline_pressure=0.42, bonus_dependency=0.31, penalty_severity=0.77)
    assert incentive_index(policy) == incentive_index(policy)
