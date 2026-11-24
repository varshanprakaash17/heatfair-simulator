import numpy as np
import pytest

from app.engine.exposure import (
    HourlyCondition,
    compute_exposure,
    heat_index_c,
    hourly_weights,
)


def test_heat_index_increases_with_temperature():
    lows = heat_index_c([25, 30, 35, 40], [50, 50, 50, 50])
    assert np.all(np.diff(lows) > 0)
    assert np.isfinite(lows).all()


def test_heat_index_increases_with_humidity():
    values = heat_index_c([35, 35, 35, 35], [20, 40, 60, 80])
    assert np.all(np.diff(values) > 0)


def test_heat_index_is_not_wbgt_but_plausible():
    # A heat index is normally above dry-bulb temperature at high humidity.
    value = heat_index_c([38], [70])[0]
    assert 40 < value < 65


def test_hourly_weights_sum_to_duration():
    conditions = [HourlyCondition(h, 35, 60) for h in range(8)]
    weights = hourly_weights(conditions, 8)
    assert pytest.approx(weights.sum(), rel=1e-9) == 8
    assert np.allclose(weights, 1.0)


def test_exposure_zero_below_reference():
    conditions = [HourlyCondition(h, 18, 60) for h in range(8)]
    result = compute_exposure(conditions, work_intensity=0.8, shift_hours=8)
    assert float(result.exposure_raw[0]) == pytest.approx(0.0)
    assert float(result.exposure_index[0]) == pytest.approx(0.0)


def test_exposure_formula_matches_manual_calculation():
    conditions = [HourlyCondition(h, 36, 55) for h in range(4)]
    result = compute_exposure(conditions, work_intensity=1.0, shift_hours=4)
    hi = heat_index_c([36], [55])[0]
    expected = 4 * (1.6) * max(0.0, hi - 26.0)
    assert float(result.exposure_raw[0]) == pytest.approx(expected, rel=1e-3)


def test_higher_intensity_increases_exposure():
    conditions = [HourlyCondition(h, 35, 60) for h in range(8)]
    light = compute_exposure(conditions, work_intensity=0.1, shift_hours=8).exposure_raw[0]
    heavy = compute_exposure(conditions, work_intensity=0.95, shift_hours=8).exposure_raw[0]
    assert heavy > light


def test_accessible_breaks_reduce_exposure():
    conditions = [HourlyCondition(h, 38, 60) for h in range(8)]
    without = compute_exposure(
        conditions, work_intensity=0.8, shift_hours=8, exposure_hours=8, accessibility=0.0
    )
    with_breaks = compute_exposure(
        conditions, work_intensity=0.8, shift_hours=8, exposure_hours=6.5, accessibility=0.9
    )
    assert float(with_breaks.exposure_raw[0]) < float(without.exposure_raw[0])


def test_flexible_deadlines_reduce_excess_heat():
    conditions = [HourlyCondition(h, 36, 60) for h in range(8)]
    rigid = compute_exposure(conditions, 0.7, 8, flexible_deadlines=False)
    flexible = compute_exposure(conditions, 0.7, 8, flexible_deadlines=True)
    assert flexible.exposure_raw[0] < rigid.exposure_raw[0]


def test_exposure_index_bounded_and_array_shaped(population):
    conditions = [HourlyCondition(h, 44, 80) for h in range(8)]
    result = compute_exposure(
        conditions, population.work_intensity, population.shift_hours, population.heat_tolerance
    )
    assert result.exposure_index.shape == (population.size,)
    assert np.all(result.exposure_index >= 0) and np.all(result.exposure_index <= 100)
    assert np.isfinite(result.exposure_index).all()


def test_empty_conditions_rejected():
    with pytest.raises(ValueError):
        compute_exposure([], 0.5, 8)
