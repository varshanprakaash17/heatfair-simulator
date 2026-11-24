"""Deterministic hourly climate conditions for a scenario."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .constants import DIURNAL_HUMIDITY_OFFSET, DIURNAL_TEMPERATURE_OFFSET
from .exposure import HourlyCondition


@dataclass
class ScenarioSpec:
    name: str = "Synthetic scenario"
    temperature: float = 34.0
    humidity: float = 60.0
    work_duration: float = 8.0
    work_intensity: str = "moderate"       # light | moderate | heavy | very_heavy
    hourly_conditions: list[dict] | None = None
    location: dict | None = None
    source: str = "synthetic"
    shift_start_hour: int = 6

    def intensity_value(self) -> float:
        return INTENSITY_LEVELS.get(self.work_intensity, 0.55)


INTENSITY_LEVELS = {
    "light": 0.25,
    "moderate": 0.55,
    "heavy": 0.78,
    "very_heavy": 0.95,
}


def scenario_hourly_conditions(scenario: ScenarioSpec) -> tuple[list[HourlyCondition], str]:
    """Return (conditions, origin) where origin documents the data provenance."""
    if scenario.hourly_conditions:
        parsed = [
            HourlyCondition(
                hour=int(row.get("hour", i)),
                temperature_c=float(row.get("temperature", row.get("temperature_c", scenario.temperature))),
                relative_humidity=float(
                    row.get("humidity", row.get("relative_humidity", scenario.humidity))
                ),
            )
            for i, row in enumerate(scenario.hourly_conditions)
        ]
        parsed.sort(key=lambda c: c.hour)
        if parsed:
            origin = (
                "open_meteo_hourly_forecast"
                if scenario.source == "open-meteo"
                else "scenario_hourly_conditions"
            )
            return parsed, origin
    conditions = []
    hours = max(1, int(np.ceil(scenario.work_duration)))
    for offset in range(hours):
        hour = (int(scenario.shift_start_hour) + offset) % 24
        conditions.append(
            HourlyCondition(
                hour=hour,
                temperature_c=round(scenario.temperature + DIURNAL_TEMPERATURE_OFFSET[hour], 2),
                relative_humidity=float(
                    np.clip(scenario.humidity + DIURNAL_HUMIDITY_OFFSET[hour], 5.0, 100.0)
                ),
            )
        )
    return conditions, "synthetic_diurnal_profile"


def hourly_series(scenario: ScenarioSpec) -> list[dict]:
    """Serialisable hourly series used by the climate chart."""
    conditions, origin = scenario_hourly_conditions(scenario)
    from .exposure import heat_index_c

    hi = heat_index_c(
        [c.temperature_c for c in conditions], [c.relative_humidity for c in conditions]
    )
    start = int(scenario.shift_start_hour)
    return [
        {
            "index": i,
            "hour": c.hour,
            "label": f"{c.hour:02d}:00",
            "temperature": round(c.temperature_c, 2),
            "humidity": round(c.relative_humidity, 1),
            "heat_index": round(float(hi[i]), 2),
            "source": origin,
        }
        for i, c in enumerate(conditions)
    ]
