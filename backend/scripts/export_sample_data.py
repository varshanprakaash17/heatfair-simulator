"""Export illustrative demo data for the repository's data/ directory.

Usage:  .venv/Scripts/python.exe scripts/export_sample_data.py
Writes data/sample_workers.json and data/climate_scenarios.json (500 synthetic
profiles, seed 42) so the repository ships with the same demo used by the UI.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.engine.scenario import ScenarioSpec, hourly_series  # noqa: E402
from app.engine.workers import generate_workers  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    population = generate_workers(500, seed=42)
    (DATA_DIR / "sample_workers.json").write_text(
        json.dumps(
            {
                "description": "500 synthetic outdoor-worker profiles, seed 42. Illustrative only.",
                "seed": 42,
                "synthetic": True,
                "summary": population.summary(),
                "workers": population.to_records(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    scenarios = [
        ("Normal working conditions", 27.0, 52.0, 8.0, "moderate", 7),
        ("Hot working conditions", 34.0, 62.0, 8.0, "heavy", 6),
        ("Extreme heat scenario", 40.0, 55.0, 9.0, "very_heavy", 6),
    ]
    payload = []
    for name, temp, humidity, duration, intensity, start in scenarios:
        spec = ScenarioSpec(
            name=name,
            temperature=temp,
            humidity=humidity,
            work_duration=duration,
            work_intensity=intensity,
            shift_start_hour=start,
        )
        payload.append(
            {
                "name": name,
                "temperature": temp,
                "humidity": humidity,
                "work_duration": duration,
                "work_intensity": intensity,
                "shift_start_hour": start,
                "source": "synthetic",
                "illustrative": True,
                "hourly_preview": hourly_series(spec),
            }
        )
    (DATA_DIR / "climate_scenarios.json").write_text(
        json.dumps(
            {
                "description": "Three illustrative climate scenarios derived from a documented diurnal profile.",
                "scenarios": payload,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote demo data to {DATA_DIR}")


if __name__ == "__main__":
    main()
