import numpy as np
import pytest

from app.engine.simulation import SimulationRequest, run_simulation
from app.engine.workers import generate_workers
from app.optimizer.search import optimize


def test_identical_inputs_produce_identical_results(policy, scenario):
    population = generate_workers(120, seed=11)
    first = run_simulation(SimulationRequest(policy=policy, scenario=scenario, workers=population, seed=11))
    second = run_simulation(SimulationRequest(policy=policy, scenario=scenario, workers=population, seed=11))
    assert first["metrics"]["exposure_index"] == second["metrics"]["exposure_index"]
    assert first["metrics"]["income_retention"] == second["metrics"]["income_retention"]
    assert first["metrics"]["break_accessibility"] == second["metrics"]["break_accessibility"]
    assert first["hourly"] == second["hourly"]


def test_metrics_are_finite(policy, scenario, population):
    results = run_simulation(SimulationRequest(policy=policy, scenario=scenario, workers=population))
    for key, value in results["metrics"].items():
        if isinstance(value, (int, float)):
            assert np.isfinite(value), key
    assert np.isfinite(results["metrics"]["exposure_stats"]["std"])
    assert np.isfinite(results["metrics"]["income_retention_stats"]["min"])
    assert results["metrics"]["income_retention"] > 0


def test_policy_change_changes_numeric_output(scenario, population):
    from app.engine.incentive import PolicySpec

    harsh = PolicySpec(
        deadline_pressure=0.95, bonus_dependency=0.95, penalty_severity=0.9,
        break_compensation=0.0, protected_break_minutes=0.0, flexible_deadlines=False,
    )
    protective = PolicySpec(
        deadline_pressure=0.2, bonus_dependency=0.3, penalty_severity=0.1,
        break_compensation=1.0, protected_break_minutes=90, flexible_deadlines=True,
    )
    a = run_simulation(SimulationRequest(policy=harsh, scenario=scenario, workers=population))["metrics"]
    b = run_simulation(SimulationRequest(policy=protective, scenario=scenario, workers=population))["metrics"]
    assert b["break_accessibility"] > a["break_accessibility"]
    assert b["exposure_index"] < a["exposure_index"]
    assert b["income_retention"] > a["income_retention"]
    assert b["incentive_pressure_index"] < a["incentive_pressure_index"]


def test_harsher_scenario_increases_exposure(policy):
    from app.engine.scenario import ScenarioSpec

    population = generate_workers(100, seed=5)
    mild = ScenarioSpec(name="mild", temperature=24, humidity=45, work_intensity="light")
    extreme = ScenarioSpec(name="extreme", temperature=44, humidity=70, work_intensity="very_heavy")
    mild_metrics = run_simulation(
        SimulationRequest(policy=policy, scenario=mild, workers=population)
    )["metrics"]
    extreme_metrics = run_simulation(
        SimulationRequest(policy=policy, scenario=extreme, workers=population)
    )["metrics"]
    assert extreme_metrics["exposure_index"] > mild_metrics["exposure_index"]
    assert extreme_metrics["exposure_index"] <= 100


def test_optimization_is_reproducible(policy, scenario):
    population = generate_workers(150, seed=9)
    first = optimize(policy, scenario, population, candidate_count=12, seed=4)
    second = optimize(policy, scenario, population, candidate_count=12, seed=4)
    assert [c["id"] for c in first.frontier] == [c["id"] for c in second.frontier]
    for a, b in zip(first.frontier, second.frontier):
        assert a["objectives"] == b["objectives"]


def test_baseline_is_a_proper_counterfactual(policy, scenario, population):
    results = run_simulation(SimulationRequest(policy=policy, scenario=scenario, workers=population))
    baseline = results["metrics"]["baseline"]
    assert baseline["break_accessibility"] < results["metrics"]["break_accessibility"]
    assert baseline["income_retention"] != results["metrics"]["income_retention"]
    assert results["metrics"]["delta_vs_baseline"]["break_accessibility"] > 0
