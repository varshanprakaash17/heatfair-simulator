"""Candidate generation and multi-objective policy search.

Strategy (deliberately simple enough to run inside a request):

1. Build reference candidates the user can recognise (the current policy, a
   "protection-first" preset, an "operations-first" preset, a "balanced" preset).
2. Add a deterministic, seeded sample of the remaining policy space, drawn from
   a scrambled grid so coverage is even rather than clustered.
3. Evaluate every candidate through the *real* simulation engine
   (``quick_evaluate``), collecting objectives in their natural units.
4. Reject constraint-violating candidates (budget, minimum protection,
   operational capacity, maximum shift length) and record why.
5. Compute the Pareto front from the evaluated candidates only.

No objective is ever combined into a single score: trade-offs stay visible.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from ..engine.constants import OPTIMIZER_BOUNDS, OPTIMIZER_CONSTRAINTS
from ..engine.incentive import PolicySpec
from ..engine.scenario import ScenarioSpec
from ..engine.simulation import quick_evaluate
from ..engine.workers import WorkerPopulation
from .pareto import annotate, normalise, objective_ranges, pareto_front

SHIFT_PRESETS = [
    {"name": "Uniform shifts", "shift_scale": 1.00, "describe": "All shifts keep their configured length"},
    {"name": "Front-loaded shifts", "shift_scale": 0.95, "describe": "Shifts shortened by 5% to reduce peak-hour exposure"},
    {"name": "Compressed week", "shift_scale": 0.90, "describe": "Shifts shortened by 10%, more days required"},
]


@dataclass
class CandidatePolicy:
    id: str
    label: str
    deadline_pressure: float
    bonus_dependency: float
    penalty_severity: float
    break_compensation: float
    protected_break_minutes: float
    flexible_deadlines: bool
    shift_scale: float
    strategy: str

    def to_policy(self, base: PolicySpec) -> PolicySpec:
        return PolicySpec(
            name=self.label,
            deadline_pressure=self.deadline_pressure,
            bonus_dependency=self.bonus_dependency,
            penalty_severity=self.penalty_severity,
            break_compensation=self.break_compensation,
            protected_break_minutes=self.protected_break_minutes,
            flexible_deadlines=self.flexible_deadlines,
            paid_breaks=base.paid_breaks,
            penalise_safety_delays=base.penalise_safety_delays,
            max_shift_hours=base.max_shift_hours,
            budget_limit=base.budget_limit,
        )

    def changed_parameters(self, base: PolicySpec) -> list[dict]:
        changes = []
        pairs = [
            ("deadline_pressure", base.deadline_pressure, self.deadline_pressure),
            ("bonus_dependency", base.bonus_dependency, self.bonus_dependency),
            ("penalty_severity", base.penalty_severity, self.penalty_severity),
            ("break_compensation", base.break_compensation, self.break_compensation),
            ("protected_break_minutes", base.protected_break_minutes, self.protected_break_minutes),
            ("flexible_deadlines", base.flexible_deadlines, self.flexible_deadlines),
        ]
        for key, before, after in pairs:
            if isinstance(before, bool):
                if bool(before) != bool(after):
                    changes.append({"parameter": key, "before": before, "after": after})
            elif abs(float(before) - float(after)) > 1e-9:
                changes.append(
                    {"parameter": key, "before": round(float(before), 3), "after": round(float(after), 3)}
                )
        if abs(self.shift_scale - 1.0) > 1e-9:
            changes.append(
                {"parameter": "shift_length_scale", "before": 1.0, "after": round(self.shift_scale, 3)}
            )
        return changes


def _reference_candidates(base: PolicySpec) -> list[CandidatePolicy]:
    return [
        CandidatePolicy(
            id="cand-current", label="Current policy",
            deadline_pressure=base.deadline_pressure, bonus_dependency=base.bonus_dependency,
            penalty_severity=base.penalty_severity, break_compensation=base.break_compensation,
            protected_break_minutes=base.protected_break_minutes,
            flexible_deadlines=base.flexible_deadlines, shift_scale=1.0, strategy="reference",
        ),
        CandidatePolicy(
            id="cand-protection", label="Protection-first",
            deadline_pressure=0.15, bonus_dependency=0.3, penalty_severity=0.1,
            break_compensation=1.0, protected_break_minutes=90,
            flexible_deadlines=True, shift_scale=0.9, strategy="maximise worker protection",
        ),
        CandidatePolicy(
            id="cand-operations", label="Operations-first",
            deadline_pressure=base.deadline_pressure, bonus_dependency=base.bonus_dependency,
            penalty_severity=base.penalty_severity, break_compensation=0.25,
            protected_break_minutes=30, flexible_deadlines=False, shift_scale=1.0,
            strategy="minimise operational disruption",
        ),
        CandidatePolicy(
            id="cand-balanced", label="Balanced protection",
            deadline_pressure=0.35, bonus_dependency=0.55, penalty_severity=0.3,
            break_compensation=0.75, protected_break_minutes=60,
            flexible_deadlines=True, shift_scale=0.95, strategy="balance all three objectives",
        ),
    ]


def generate_candidates(
    base: PolicySpec,
    count: int = 36,
    seed: int = 42,
) -> list[CandidatePolicy]:
    """Deterministic candidate set: references plus a scrambled-grid sample."""
    if count < 4:
        raise ValueError("At least 4 candidates are required")
    if count > 200:
        raise ValueError("At most 200 candidates are supported per run")

    candidates = _reference_candidates(base)
    rng = np.random.default_rng(seed)

    levels_break = np.array([30.0, 45.0, 60.0, 75.0, 90.0, 105.0])
    levels_comp = np.array([0.3, 0.5, 0.75, 1.0])
    levels_flex = np.array([0.0, 1.0])
    levels_deadline = np.array([0.15, 0.35, 0.55, 0.75])
    levels_penalty = np.array([0.1, 0.25, 0.45, 0.65])
    levels_shift = np.array([0.9, 0.95, 1.0])

    generated: list[CandidatePolicy] = []
    seen: set[tuple] = set()
    attempts = 0
    target = count - len(candidates)
    while len(generated) < target and attempts < target * 40:
        attempts += 1
        key = (
            float(rng.choice(levels_break)),
            float(rng.choice(levels_comp)),
            float(rng.choice(levels_flex)),
            float(rng.choice(levels_deadline)),
            float(rng.choice(levels_penalty)),
            float(rng.choice(levels_shift)),
        )
        if key in seen:
            continue
        seen.add(key)
        minutes, comp, flex, deadline, penalty, shift = key
        generated.append(
            CandidatePolicy(
                id=f"cand-{len(candidates) + len(generated) + 1:02d}",
                label=f"Variant {len(candidates) + len(generated) + 1:02d}",
                deadline_pressure=deadline,
                bonus_dependency=round(float(np.clip(base.bonus_dependency + rng.normal(0, 0.08), 0.05, 0.95)), 3),
                penalty_severity=penalty,
                break_compensation=comp,
                protected_break_minutes=minutes,
                flexible_deadlines=bool(flex),
                shift_scale=shift,
                strategy="grid search",
            )
        )

    return candidates + generated


def check_constraints(
    candidate: CandidatePolicy,
    evaluation: dict,
    base_shift_hours: float,
    constraints: dict | None = None,
) -> tuple[bool, list[str]]:
    """Return (feasible, violations)."""
    c = {**OPTIMIZER_CONSTRAINTS, **(constraints or {})}
    violations: list[str] = []

    if not evaluation["within_budget"]:
        violations.append(
            f"cost {evaluation['cost_per_worker_shift']:.2f} exceeds budget {evaluation['budget_limit']:.2f}"
            if "budget_limit" in evaluation
            else f"cost {evaluation['cost_per_worker_shift']:.2f} exceeds the policy budget"
        )
    if evaluation["break_accessibility"] < c["min_break_accessibility"]:
        violations.append(
            f"break accessibility {evaluation['break_accessibility']:.1f}% < {c['min_break_accessibility']:.0f}%"
        )
    if evaluation["operational_efficiency"] < c["min_operational_efficiency"]:
        violations.append(
            f"operational efficiency {evaluation['operational_efficiency']:.1f}% < {c['min_operational_efficiency']:.0f}%"
        )
    if base_shift_hours * candidate.shift_scale > c["max_shift_hours"] + 1e-9:
        violations.append(
            f"shift length {base_shift_hours * candidate.shift_scale:.1f}h > {c['max_shift_hours']}h"
        )
    return (len(violations) == 0, violations)


@dataclass
class OptimizationOutcome:
    candidates: list[dict]
    frontier: list[dict]
    ranges: dict
    constraints: dict
    generated: int
    evaluated: int
    feasible: int
    seed: int = 42
    notes: list[str] = field(default_factory=list)


def optimize(
    base_policy: PolicySpec,
    scenario: ScenarioSpec,
    population: WorkerPopulation,
    candidate_count: int = 36,
    seed: int = 42,
    constraints: dict | None = None,
) -> OptimizationOutcome:
    """Evaluate candidates and return the Pareto-efficient set."""
    # Candidate shift_scale shrinks the population's shifts temporarily.
    candidates = generate_candidates(base_policy, candidate_count, seed)
    base_shift = float(np.mean(population.shift_hours))

    evaluated: list[dict] = []
    infeasible: list[dict] = []

    for cand in candidates:
        policy = cand.to_policy(base_policy)
        pop = population
        if abs(cand.shift_scale - 1.0) > 1e-9:
            pop = WorkerPopulation(
                ids=population.ids,
                occupations=population.occupations,
                hourly_income=population.hourly_income,
                work_intensity=population.work_intensity,
                shift_hours=population.shift_hours * cand.shift_scale,
                workload=population.workload,
                incentive_sensitivity=population.incentive_sensitivity,
                break_need=population.break_need,
                heat_tolerance=population.heat_tolerance,
                seed=population.seed,
                config=population.config,
            )
            policy = policy.clamped()

        ev = quick_evaluate(policy, scenario, pop)
        feasible, violations = check_constraints(
            cand, ev, base_shift, constraints
        )
        record = {
            "id": cand.id,
            "label": cand.label,
            "strategy": cand.strategy,
            "policy": {
                "deadline_pressure": cand.deadline_pressure,
                "bonus_dependency": cand.bonus_dependency,
                "penalty_severity": cand.penalty_severity,
                "break_compensation": cand.break_compensation,
                "protected_break_minutes": cand.protected_break_minutes,
                "flexible_deadlines": cand.flexible_deadlines,
                "paid_breaks": base_policy.paid_breaks,
                "penalise_safety_delays": base_policy.penalise_safety_delays,
                "max_shift_hours": base_policy.max_shift_hours,
                "shift_scale": cand.shift_scale,
            },
            "changed_parameters": cand.changed_parameters(base_policy),
            "objectives": {
                "exposure": round(ev["exposure"], 4),
                "income_loss": round(ev["income_loss"], 4),
                "disruption": round(ev["disruption"], 4),
            },
            "supporting_metrics": {
                "income_retention": ev["income_retention"],
                "break_accessibility": ev["break_accessibility"],
                "operational_efficiency": ev["operational_efficiency"],
                "cost_per_worker_shift": ev["cost_per_worker_shift"],
            },
            "feasible": feasible,
            "violations": violations,
        }
        # Flat objective keys keep dominance code simple and auditable.
        record.update(record["objectives"])
        evaluated.append(record)
        if not feasible:
            infeasible.append(record)

    feasible_records = [r for r in evaluated if r["feasible"]]
    pool = feasible_records or evaluated

    frontier_raw = pareto_front(pool)
    annotated_pool = annotate(pool)
    frontier_ids = {r["id"] for r in frontier_raw}
    ranges = objective_ranges(pool)

    candidate_payload = []
    for rec in annotated_pool:
        item = dict(rec)
        item["normalised"] = normalise(rec, ranges)
        item["on_frontier"] = rec["id"] in frontier_ids
        candidate_payload.append(item)

    frontier_payload = [
        dict(rec)
        for rec in candidate_payload
        if rec["on_frontier"]
    ]
    frontier_payload.sort(key=lambda r: r["exposure"])

    notes = [
        f"{len(candidates)} candidate policies generated (seeded, reproducible with seed {seed}).",
        f"{len(feasible_records)} candidates satisfied every constraint; {len(infeasible)} were rejected.",
        "Objectives are reported in original units; normalised values are for plotting only.",
        "No composite score is used, so trade-offs remain visible.",
    ]
    if not feasible_records:
        notes.append(
            "No candidate satisfied all constraints, so the frontier is drawn from the full evaluated set."
        )

    # Attach the minimal-policy-change frontier pick for the UI.
    if frontier_payload:
        smallest_change = min(
            frontier_payload,
            key=lambda r: (
                abs(float(r["policy"]["protected_break_minutes"]) - base_policy.protected_break_minutes)
                + 100 * abs(float(r["policy"]["break_compensation"]) - base_policy.break_compensation)
                + 50 * abs(float(r["policy"]["deadline_pressure"]) - base_policy.deadline_pressure)
            ),
        )
        for rec in frontier_payload:
            rec["recommended"] = rec["id"] == smallest_change["id"]

    return OptimizationOutcome(
        candidates=candidate_payload,
        frontier=frontier_payload,
        ranges=ranges,
        constraints={
            **OPTIMIZER_CONSTRAINTS,
            **(constraints or {}),
            "budget_limit": float(base_policy.budget_limit),
        },
        generated=len(candidates),
        evaluated=len(evaluated),
        feasible=len(feasible_records),
        seed=seed,
        notes=notes,
    )


def candidate_to_policy_dict(candidate: dict, base_policy) -> dict:
    p = candidate["policy"]
    return {
        "name": f"{candidate['label']} (optimised)",
        "deadline_pressure": p["deadline_pressure"],
        "bonus_dependency": p["bonus_dependency"],
        "penalty_severity": p["penalty_severity"],
        "break_compensation": p["break_compensation"],
        "protected_break_minutes": p["protected_break_minutes"],
        "flexible_deadlines": p["flexible_deadlines"],
        "paid_breaks": getattr(base_policy, "paid_breaks", True),
        "penalise_safety_delays": getattr(base_policy, "penalise_safety_delays", False),
        "max_shift_hours": p.get("max_shift_hours", getattr(base_policy, "max_shift_hours", 10.0)),
        "budget_limit": base_policy.budget_limit,
    }


__all__ = [
    "CandidatePolicy",
    "OptimizationOutcome",
    "SHIFT_PRESETS",
    "candidate_to_policy_dict",
    "check_constraints",
    "generate_candidates",
    "optimize",
    "OPTIMIZER_BOUNDS",
]
