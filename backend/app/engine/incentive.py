"""Financial incentive-pressure analysis.

The pressure indicator answers a narrow question: how strongly does a written
policy *reward* skipping or shortening breaks? It is a weighted sum of four
normalised inputs, and it is deliberately **not** a prediction of what a worker
will do.

    IP = w_deadline * deadline_pressure
       + w_bonus    * bonus_dependency
       + w_penalty  * penalty_severity
       + w_break    * (1 - break_compensation)

All inputs are in [0, 1]; the weights are in ``constants.INCENTIVE_WEIGHTS`` and
sum to 1, so IP lies in [0, 1] before the 0-100 presentation scaling.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .constants import INCENTIVE_WEIGHTS


@dataclass(frozen=True)
class PolicySpec:
    """Normalised workplace policy. All fractions are 0-1 unless suffixed."""

    name: str = "Unnamed policy"
    deadline_pressure: float = 0.5
    bonus_dependency: float = 0.5
    penalty_severity: float = 0.5
    break_compensation: float = 0.0          # fraction of hourly wage paid during protected breaks
    protected_break_minutes: float = 0.0     # per shift
    flexible_deadlines: bool = False
    paid_breaks: bool = False                # break entitlement paid even when taken informally
    penalise_safety_delays: bool = False     # safety-related delays count toward penalties
    max_shift_hours: float = 10.0            # contractual ceiling used by the engine
    budget_limit: float = 15.0               # currency units per worker-shift for protection measures

    def clamped(self) -> "PolicySpec":
        return PolicySpec(
            name=self.name,
            deadline_pressure=float(np.clip(self.deadline_pressure, 0.0, 1.0)),
            bonus_dependency=float(np.clip(self.bonus_dependency, 0.0, 1.0)),
            penalty_severity=float(np.clip(self.penalty_severity, 0.0, 1.0)),
            break_compensation=float(np.clip(self.break_compensation, 0.0, 1.0)),
            protected_break_minutes=float(np.clip(self.protected_break_minutes, 0.0, 240.0)),
            flexible_deadlines=bool(self.flexible_deadlines),
            paid_breaks=bool(self.paid_breaks),
            penalise_safety_delays=bool(self.penalise_safety_delays),
            max_shift_hours=float(np.clip(self.max_shift_hours, 1.0, 16.0)),
            budget_limit=max(0.0, float(self.budget_limit)),
        )


def incentive_pressure(
    policy: PolicySpec,
    incentive_sensitivity=None,
    weights: dict[str, float] | None = None,
) -> np.ndarray:
    """Return incentive pressure in [0, 1] for one or more sensitivity values.

    ``incentive_sensitivity`` (0-1) amplifies the *effect* of the pressure on a
    worker's behaviour; the pressure indicator itself is a policy property, so
    the unscaled value is returned by default.
    """
    w = weights or INCENTIVE_WEIGHTS
    p = policy.clamped()
    raw = (
        w["deadline_pressure"] * p.deadline_pressure
        + w["bonus_dependency"] * p.bonus_dependency
        + w["penalty_severity"] * p.penalty_severity
        + w["uncompensated_break"] * (1.0 - p.break_compensation)
    )
    base = float(np.clip(raw, 0.0, 1.0))
    if incentive_sensitivity is None:
        return np.array([base])
    sens = np.clip(np.asarray(incentive_sensitivity, dtype=float), 0.0, 1.0)
    # A worker with low sensitivity experiences less effective pressure.
    effective = base * (0.75 + 0.5 * sens)
    return np.clip(effective, 0.0, 1.0)


def incentive_index(policy: PolicySpec) -> float:
    """0-100 presentation value of the policy's incentive pressure."""
    return float(np.round(incentive_pressure(policy)[0] * 100.0, 2))


def incentive_breakdown(policy: PolicySpec) -> dict:
    """Contribution of each component, for explainability panels and reports."""
    w = INCENTIVE_WEIGHTS
    p = policy.clamped()
    parts = {
        "deadline_pressure": w["deadline_pressure"] * p.deadline_pressure,
        "bonus_dependency": w["bonus_dependency"] * p.bonus_dependency,
        "penalty_severity": w["penalty_severity"] * p.penalty_severity,
        "uncompensated_break": w["uncompensated_break"] * (1.0 - p.break_compensation),
    }
    total = sum(parts.values()) or 1.0
    return {
        "contributions": {k: round(v * 100.0, 3) for k, v in parts.items()},
        "share_of_total": {k: round(100.0 * v / total, 2) for k, v in parts.items()},
        "weights": w,
        "index": round(total * 100.0, 2),
    }
