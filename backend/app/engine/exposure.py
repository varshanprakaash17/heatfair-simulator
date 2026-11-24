"""Environmental heat exposure estimation.

Method
------
1. Convert each hourly (temperature, relative humidity) pair into a *heat index*
   using the NWS/Rothfusz regression (Steadman apparent temperature in the
   shade). This is a heat-index estimate -- **not** WBGT, and not a wet-bulb
   measurement. It ignores solar radiation, wind speed, clothing and
   acclimatisation physiology.
2. Score excess heat above a configurable reference temperature.
3. Weight each hour by duration and work intensity and sum:

       E = sum_t  duration_t * intensity_multiplier * max(0, heat_index_t - T_ref)

   E carries units of degrees-Celsius-hours above reference ("excess heat
   hours"). It is a comparative indicator of *relative* exposure between
   policies and scenarios, not an absolute physiological dose.
4. Reduce E for time actually spent resting in shade. Accessible protected
   breaks and unpaid rest remove exposure time; blocked breaks still allow a
   small amount of opportunistic shade rest. Flexible deadlines apply an extra
   re-sequencing factor for moving work into cooler hours.

The reported 0-100 index is a saturating rescale of E,
``100 * (1 - exp(-E / (shift_hours * 20)))``, so it stays readable across mild
and extreme scenarios without most values clipping at 100.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np

from .constants import (
    DIURNAL_HUMIDITY_OFFSET,
    DIURNAL_TEMPERATURE_OFFSET,
    EXPOSURE_FLEXIBILITY_FACTOR,
    EXPOSURE_INDEX_SCALE_C,
    EXPOSURE_REFERENCE_C,
    INTENSITY_MULTIPLIER_MAX,
    INTENSITY_MULTIPLIER_MIN,
    OPPORTUNISTIC_REST_HOURS,
)


@dataclass(frozen=True)
class HourlyCondition:
    """One hour of environmental conditions for the site."""

    hour: int
    temperature_c: float
    relative_humidity: float


@dataclass
class ExposureSettings:
    reference_c: float = EXPOSURE_REFERENCE_C
    intensity_min: float = INTENSITY_MULTIPLIER_MIN
    intensity_max: float = INTENSITY_MULTIPLIER_MAX
    index_scale_c: float = EXPOSURE_INDEX_SCALE_C
    flexibility_factor: float = EXPOSURE_FLEXIBILITY_FACTOR

    def intensity_multiplier(self, work_intensity: float | np.ndarray):
        """Linear map from normalised work intensity (0-1) to a multiplier."""
        wi = np.clip(np.asarray(work_intensity, dtype=float), 0.0, 1.0)
        out = self.intensity_min + (self.intensity_max - self.intensity_min) * wi
        return float(out) if np.ndim(out) == 0 else out


def _fahrenheit_to_celsius(f: np.ndarray) -> np.ndarray:
    return (f - 32.0) * 5.0 / 9.0


def heat_index_c(temperature_c, relative_humidity) -> np.ndarray:
    """Heat index (deg C) from the Rothfusz regression, vectorised.

    Below 26.7 degC (80 degF) the simple Steadman average is used, matching the
    NWS operational convention. Inputs are clipped to physically plausible
    ranges so the regression is never evaluated far outside its support.
    """
    t_c = np.clip(np.asarray(temperature_c, dtype=float), -50.0, 60.0)
    rh = np.clip(np.asarray(relative_humidity, dtype=float), 0.0, 100.0)
    t = t_c * 9.0 / 5.0 + 32.0

    hi = (
        -42.379
        + 2.04901523 * t
        + 10.14333127 * rh
        - 0.22475541 * t * rh
        - 6.83783e-3 * t * t
        - 5.481717e-2 * rh * rh
        + 1.22874e-3 * t * t * rh
        + 8.5282e-4 * t * rh * rh
        - 1.99e-6 * t * t * rh * rh
    )

    low_humidity = (rh < 13.0) & (t >= 80.0) & (t <= 112.0)
    hi = np.where(
        low_humidity,
        hi - ((13.0 - rh) / 4.0) * np.sqrt(np.maximum(0.0, (17.0 - np.abs(t - 95.0)) / 17.0)),
        hi,
    )
    high_humidity = (rh > 85.0) & (t >= 80.0) & (t <= 87.0)
    hi = np.where(high_humidity, hi + ((rh - 85.0) / 10.0) * ((87.0 - t) / 5.0), hi)

    simple = 0.5 * (t + 61.0 + ((t - 68.0) * 1.2) + (rh * 0.094))
    hi = np.where(t < 80.0, simple, hi)
    return _fahrenheit_to_celsius(hi)


def build_hourly_conditions(
    temperature_c: float,
    relative_humidity: float,
    shift_start_hour: int = 6,
    duration_hours: float = 8.0,
    hourly_conditions: Iterable[dict] | None = None,
    humidity_night_boost: bool = True,
) -> list[HourlyCondition]:
    """Return the hourly conditions a shift actually experiences.

    If ``hourly_conditions`` is supplied (from a scenario or a weather provider)
    those values are used as-is. Otherwise a documented synthetic diurnal curve
    is applied around the scenario's daily mean. The curve is a modelling
    assumption, not measured data, and the API records which case applied.
    """
    duration = max(0.0, float(duration_hours))
    if hourly_conditions:
        parsed: list[HourlyCondition] = []
        for row in hourly_conditions:
            hour = int(row.get("hour", 0))
            parsed.append(
                HourlyCondition(
                    hour=hour,
                    temperature_c=float(row["temperature"] if "temperature" in row else row["temperature_c"]),
                    relative_humidity=float(
                        row["humidity"] if "humidity" in row else row["relative_humidity"]
                    ),
                )
            )
        parsed.sort(key=lambda c: c.hour)
        if parsed:
            return parsed

    conditions: list[HourlyCondition] = []
    whole_hours = int(np.ceil(duration))
    for offset in range(max(1, whole_hours)):
        hour = int((shift_start_hour + offset) % 24)
        t_off = DIURNAL_TEMPERATURE_OFFSET[hour]
        rh_off = DIURNAL_HUMIDITY_OFFSET[hour]
        if not humidity_night_boost:
            rh_off *= 0.5
        conditions.append(
            HourlyCondition(
                hour=hour,
                temperature_c=round(temperature_c + t_off, 2),
                relative_humidity=float(np.clip(relative_humidity + rh_off, 10.0, 100.0)),
            )
        )
    return conditions


@dataclass
class ExposureResult:
    exposure_raw: np.ndarray          # excess heat hours per worker
    exposure_index: np.ndarray        # 0-100 comparative index
    hourly_excess: np.ndarray         # per-hour excess heat (degC) at reference intensity
    hourly_heat_index: np.ndarray
    hourly_duration: np.ndarray
    mean_intensity_multiplier: float
    reference_c: float = EXPOSURE_REFERENCE_C
    assumptions: dict = field(default_factory=dict)


def hourly_weights(conditions: Sequence[HourlyCondition], duration_hours: float) -> np.ndarray:
    """Split a shift evenly across the hours it covers, honouring partial hours."""
    n = len(conditions)
    if n == 0:
        return np.zeros(0)
    duration = max(0.0, float(duration_hours))
    return np.full(n, duration / n, dtype=float)


def compute_exposure(
    conditions: Sequence[HourlyCondition],
    work_intensity,
    shift_hours,
    heat_tolerance=None,
    exposure_hours=None,
    accessibility=None,
    flexible_deadlines: bool = False,
    settings: ExposureSettings | None = None,
) -> ExposureResult:
    """Compute per-worker excess heat exposure.

    ``work_intensity`` may be a scalar or an array (one entry per worker).
    ``exposure_hours`` is the number of shift hours actually spent working in
    heat (shift length minus protective rest); when omitted the whole shift is
    counted. ``accessibility`` (0-1) lets blocked breaks still remove a small
    amount of exposure via opportunistic shade rest. ``heat_tolerance`` stands in
    for acclimatisation and individual variation; it is not a medical quantity.
    """
    settings = settings or ExposureSettings()
    if not conditions:
        raise ValueError("At least one hourly condition is required")

    temps = np.array([c.temperature_c for c in conditions], dtype=float)
    rh = np.array([c.relative_humidity for c in conditions], dtype=float)
    hi = heat_index_c(temps, rh)

    shift = np.atleast_1d(np.asarray(shift_hours, dtype=float))
    weights = hourly_weights(conditions, float(shift.mean()) if shift.size else 0.0)
    excess = np.maximum(0.0, hi - settings.reference_c)
    mult = settings.intensity_multiplier(work_intensity)

    tolerance = np.ones_like(np.atleast_1d(np.asarray(mult, dtype=float)))
    if heat_tolerance is not None:
        tolerance = np.clip(np.atleast_1d(np.asarray(heat_tolerance, dtype=float)), 0.7, 1.4)

    if exposure_hours is None:
        exposure_share = np.ones_like(shift)
        opportunistic_hours = np.zeros_like(shift)
    else:
        hours = np.clip(np.asarray(exposure_hours, dtype=float), 0.0, shift)
        access = (
            np.clip(np.asarray(accessibility, dtype=float), 0.0, 1.0)
            if accessibility is not None
            else np.ones_like(hours)
        )
        # Even with blocked breaks, workers take brief shade rest in practice.
        opportunistic_hours = (1.0 - access) * np.clip(shift - hours, 0.0, OPPORTUNISTIC_REST_HOURS)
        hours = np.clip(hours + opportunistic_hours, 0.0, shift)
        exposure_share = hours / np.maximum(shift, 1e-6)

    scheduling = settings.flexibility_factor if flexible_deadlines else 1.0

    # E = sum_t duration_t * intensity_multiplier * max(0, HI_t - T_ref) * share * scheduling
    per_hour_excess = weights * excess
    base = float(np.sum(per_hour_excess))
    exposure_raw = base * mult / tolerance * exposure_share * scheduling

    index = 100.0 * (1.0 - np.exp(-exposure_raw / np.maximum(shift * settings.index_scale_c, 1e-6)))
    index = np.clip(index, 0.0, 100.0)

    assumptions = {
        "heat_metric": "NWS Rothfusz heat index (deg C), not WBGT",
        "exposure_formula": "E = sum_t duration_t * intensity_mult * max(0, HI_t - T_ref) * exposure_share * scheduling",
        "index_formula": "index = 100 * (1 - exp(-E / (shift_hours * 20)))",
        "reference_temperature_c": settings.reference_c,
        "intensity_multiplier_range": [settings.intensity_min, settings.intensity_max],
        "flexible_deadline_scheduling_factor": settings.flexibility_factor if flexible_deadlines else 1.0,
        "opportunistic_shade_rest_hours_cap": OPPORTUNISTIC_REST_HOURS,
        "not_included": ["solar radiation", "wind speed", "clothing", "acclimatisation physiology"],
    }

    return ExposureResult(
        exposure_raw=np.atleast_1d(exposure_raw),
        exposure_index=np.atleast_1d(index),
        hourly_excess=excess,
        hourly_heat_index=hi,
        hourly_duration=weights,
        mean_intensity_multiplier=float(np.mean(mult)),
        reference_c=settings.reference_c,
        assumptions=assumptions,
    )
