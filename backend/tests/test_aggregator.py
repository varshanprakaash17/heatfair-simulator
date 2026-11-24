import numpy as np
import pytest

from app.engine.aggregator import aggregate, histogram, summarize


def test_summarize_returns_ordered_percentiles():
    stats = summarize([1, 2, 3, 4, 5])
    assert stats["mean"] == pytest.approx(3.0)
    assert stats["median"] == pytest.approx(3.0)
    values = [stats["percentiles"][f"p{p}"] for p in (5, 10, 25, 50, 75, 90, 95)]
    assert values == sorted(values)
    assert stats["min"] == 1 and stats["max"] == 5


def test_summarize_handles_empty_and_non_finite():
    empty = summarize([])
    assert empty["count"] == 0 and empty["mean"] == 0.0
    mixed = summarize([1.0, np.nan, np.inf, 3.0])
    assert mixed["count"] == 2
    assert mixed["mean"] == pytest.approx(2.0)


def test_histogram_counts_sum_to_population():
    values = np.linspace(0, 100, 400)
    result = histogram(values, bins=10, value_range=(0, 100))
    assert sum(result["counts"]) == 400
    assert len(result["labels"]) == 10


def test_histogram_empty_payload():
    result = histogram([])
    assert result["counts"] == [] and result["bins"] == []


def test_aggregate_builds_complete_metric_block():
    size = 50
    rng = np.random.default_rng(0)
    metrics = aggregate(
        exposure_index=rng.uniform(20, 90, size),
        accessibility=rng.uniform(0.1, 0.9, size),
        income_retention=rng.uniform(80, 100, size),
        income_loss_abs=rng.uniform(0, 5, size),
        disruption_index=rng.uniform(0, 20, size),
        efficiency=rng.uniform(80, 100, size),
        unprotected_rest_hours=rng.uniform(0, 1, size),
        incentive_index=45.0,
        policy_cost={"total_cost_per_worker_shift": 4.2, "within_budget": True, "budget_limit": 20},
        baseline={
            "exposure_index": 80.0,
            "break_accessibility": 10.0,
            "income_retention": 90.0,
            "operational_disruption": 8.0,
            "operational_efficiency": 92.0,
        },
    )
    for key in (
        "exposure_index",
        "incentive_pressure_index",
        "break_accessibility",
        "income_retention",
        "operational_disruption",
        "operational_efficiency",
        "workers_exposed_above_60",
        "policy_cost",
    ):
        assert key in metrics
    assert 80 <= metrics["income_retention"] <= 100
    assert metrics["population"]["workers"] == size
    assert "delta_vs_baseline" in metrics


def test_aggregate_is_finite_for_constant_inputs():
    metrics = aggregate(
        exposure_index=[50.0] * 10,
        accessibility=[0.5] * 10,
        income_retention=[95.0] * 10,
        income_loss_abs=[0.5] * 10,
        disruption_index=[5.0] * 10,
        efficiency=[95.0] * 10,
        unprotected_rest_hours=[0.1] * 10,
        incentive_index=30.0,
        policy_cost={"total_cost_per_worker_shift": 1.0, "within_budget": True},
    )
    assert metrics["exposure_stats"]["std"] == pytest.approx(0.0)
    for value in metrics["exposure_stats"]["percentiles"].values():
        assert np.isfinite(value)
