"""Reproduce the worked example in docs/mathematical_model.md.

Usage:
    cd backend
    .venv/Scripts/python.exe scripts/reproduce_example.py      # Windows
    .venv/bin/python scripts/reproduce_example.py              # macOS / Linux
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.engine.incentive import PolicySpec  # noqa: E402
from app.engine.scenario import ScenarioSpec  # noqa: E402
from app.engine.simulation import SimulationRequest, run_simulation  # noqa: E402
from app.engine.workers import generate_workers  # noqa: E402

POLICIES = {
    "existing": PolicySpec(
        name="Existing incentive-based",
        deadline_pressure=0.82,
        bonus_dependency=0.85,
        penalty_severity=0.70,
        break_compensation=0.0,
        protected_break_minutes=0.0,
        flexible_deadlines=False,
        budget_limit=20.0,
    ),
    "protected": PolicySpec(
        name="Protected-break",
        deadline_pressure=0.45,
        bonus_dependency=0.60,
        penalty_severity=0.35,
        break_compensation=0.5,
        protected_break_minutes=60.0,
        flexible_deadlines=True,
        budget_limit=22.0,
    ),
    "income": PolicySpec(
        name="Income-protection",
        deadline_pressure=0.25,
        bonus_dependency=0.40,
        penalty_severity=0.15,
        break_compensation=1.0,
        protected_break_minutes=75.0,
        flexible_deadlines=True,
        budget_limit=30.0,
    ),
}

SCENARIOS = {
    "normal": ScenarioSpec(
        name="Normal working conditions", temperature=27, humidity=52,
        work_duration=8, work_intensity="moderate", shift_start_hour=7,
    ),
    "hot": ScenarioSpec(
        name="Hot working conditions", temperature=34, humidity=62,
        work_duration=8, work_intensity="heavy", shift_start_hour=6,
    ),
    "extreme": ScenarioSpec(
        name="Extreme heat scenario", temperature=40, humidity=55,
        work_duration=9, work_intensity="very_heavy", shift_start_hour=6,
    ),
}


def main() -> None:
    population = generate_workers(500, seed=42)
    header = f"{'scenario':9s} {'policy':10s} {'exposure':>9s} {'access':>8s} {'retention':>10s} {'disruption':>11s} {'cost':>7s}"
    print(header)
    print("-" * len(header))
    for scenario_key, scenario in SCENARIOS.items():
        for policy_key, policy in POLICIES.items():
            metrics = run_simulation(
                SimulationRequest(policy=policy, scenario=scenario, workers=population, seed=42)
            )["metrics"]
            print(
                f"{scenario_key:9s} {policy_key:10s} "
                f"{metrics['exposure_index']:9.2f} "
                f"{metrics['break_accessibility']:8.2f} "
                f"{metrics['income_retention']:10.2f} "
                f"{metrics['operational_disruption']:11.2f} "
                f"{metrics['policy_cost']['total_cost_per_worker_shift']:7.2f}"
            )


if __name__ == "__main__":
    main()
