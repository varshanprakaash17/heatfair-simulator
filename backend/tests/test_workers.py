import numpy as np
import pytest

from app.engine.workers import generate_workers


def test_same_seed_produces_identical_population():
    first = generate_workers(100, seed=17)
    second = generate_workers(100, seed=17)
    assert first.ids == second.ids
    assert np.array_equal(first.hourly_income, second.hourly_income)
    assert np.array_equal(first.shift_hours, second.shift_hours)
    assert first.occupations == second.occupations


def test_different_seed_changes_population():
    first = generate_workers(100, seed=17)
    second = generate_workers(100, seed=18)
    assert not np.array_equal(first.hourly_income, second.hourly_income)


@pytest.mark.parametrize("size", [100, 500, 1000])
def test_supported_population_sizes(size):
    population = generate_workers(size, seed=42)
    assert population.size == size
    assert len(set(population.ids)) == size


def test_profiles_are_within_documented_ranges(population):
    assert np.all(population.hourly_income > 0)
    assert np.all((population.work_intensity >= 0.15) & (population.work_intensity <= 1.0))
    assert np.all((population.shift_hours >= 4.0) & (population.shift_hours <= 11.0))
    assert np.all((population.workload >= 0) & (population.workload <= 1))
    assert np.all((population.incentive_sensitivity >= 0) & (population.incentive_sensitivity <= 1))
    assert np.all((population.heat_tolerance >= 0.75) & (population.heat_tolerance <= 1.3))


def test_records_are_synthetic_and_serialisable(population):
    records = population.to_records()
    assert len(records) == population.size
    first = records[0]
    assert first["synthetic"] is True
    assert first["synthetic_id"].startswith("W-")
    assert set(first) == {
        "synthetic_id",
        "occupation",
        "hourly_income",
        "work_intensity",
        "shift_hours",
        "workload",
        "incentive_sensitivity",
        "break_need",
        "heat_tolerance",
        "synthetic",
    }


def test_invalid_sizes_rejected():
    with pytest.raises(ValueError):
        generate_workers(0)
    with pytest.raises(ValueError):
        generate_workers(500, seed=-1)


def test_summary_reports_occupation_mix(population):
    summary = population.summary()
    assert summary["size"] == population.size
    assert sum(summary["occupations"].values()) == population.size
    assert summary["synthetic"] is True
