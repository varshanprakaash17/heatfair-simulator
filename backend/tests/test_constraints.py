import pytest

from app.engine.incentive import PolicySpec
from app.optimizer.search import check_constraints, generate_candidates


def _base_policy() -> PolicySpec:
    return PolicySpec(
        name="Base",
        deadline_pressure=0.8,
        bonus_dependency=0.8,
        penalty_severity=0.7,
        break_compensation=0.0,
        protected_break_minutes=0.0,
        flexible_deadlines=False,
        budget_limit=20.0,
    )


def _evaluation(**overrides):
    base = {
        "cost_per_worker_shift": 5.0,
        "budget_limit": 20.0,
        "within_budget": True,
        "break_accessibility": 70.0,
        "operational_efficiency": 90.0,
    }
    base.update(overrides)
    return base


def test_candidate_generation_is_deterministic():
    first = generate_candidates(_base_policy(), count=20, seed=7)
    second = generate_candidates(_base_policy(), count=20, seed=7)
    assert [c.id for c in first] == [c.id for c in second]
    assert [c.protected_break_minutes for c in first] == [
        c.protected_break_minutes for c in second
    ]


def test_candidate_count_enforced():
    assert len(generate_candidates(_base_policy(), count=12)) == 12
    with pytest.raises(ValueError):
        generate_candidates(_base_policy(), count=2)
    with pytest.raises(ValueError):
        generate_candidates(_base_policy(), count=500)


def test_candidates_respect_bounds():
    for candidate in generate_candidates(_base_policy(), count=40, seed=3):
        assert 0 <= candidate.protected_break_minutes <= 120
        assert 0 <= candidate.break_compensation <= 1
        assert 0 <= candidate.deadline_pressure <= 1
        assert 0 <= candidate.penalty_severity <= 1
        assert 0.8 <= candidate.shift_scale <= 1.05


def test_budget_violation_detected():
    candidate = generate_candidates(_base_policy(), count=4)[0]
    feasible, violations = check_constraints(
        candidate,
        _evaluation(within_budget=False, cost_per_worker_shift=30.0, budget_limit=20.0),
        base_shift_hours=8.0,
    )
    assert feasible is False
    assert any("budget" in violation for violation in violations)


def test_minimum_protection_violation_detected():
    candidate = generate_candidates(_base_policy(), count=4)[0]
    feasible, violations = check_constraints(
        candidate, _evaluation(break_accessibility=20.0), base_shift_hours=8.0
    )
    assert feasible is False
    assert any("accessibility" in violation for violation in violations)


def test_operational_capacity_violation_detected():
    candidate = generate_candidates(_base_policy(), count=4)[0]
    feasible, violations = check_constraints(
        candidate, _evaluation(operational_efficiency=50.0), base_shift_hours=8.0
    )
    assert feasible is False
    assert any("efficiency" in violation for violation in violations)


def test_changed_parameters_reported():
    base = _base_policy()
    candidate = next(c for c in generate_candidates(base, count=8) if c.id == "cand-protection")
    changes = candidate.changed_parameters(base)
    names = {change["parameter"] for change in changes}
    assert "protected_break_minutes" in names
    assert "break_compensation" in names
    assert "flexible_deadlines" in names


def test_feasible_candidate_passes():
    candidate = generate_candidates(_base_policy(), count=4)[0]
    feasible, violations = check_constraints(candidate, _evaluation(), base_shift_hours=8.0)
    assert feasible is True
    assert violations == []
