"""Income-impact model.

Baseline (no-intervention) daily income for a worker:

    baseline = wage * shift_hours
             + wage * shift_hours * PERFORMANCE_BONUS_RATE * bonus_dependency

Alternative daily income under a policy:

    protected_taken = protected_break_hours * accessibility
    worked_hours    = shift_hours - protected_taken - unpaid_rest_hours
    break_pay       = wage * break_compensation * protected_taken
    productivity    = 1 - deadline_pressure * lost_share * (1 - flexible)
    bonus_alt       = wage * worked_hours * PERFORMANCE_BONUS_RATE
                      * bonus_dependency * productivity
    penalty         = wage * shift_hours * PENALTY_RATE * penalty_severity
                      * (1 - flexible) * lost_share * deadline_pressure
    alternative     = wage * worked_hours + break_pay + bonus_alt - penalty

Only entitlement that is *actually taken* (protected hours x accessibility) is
withheld from worked hours; an inaccessible entitlement is not deducted.

Guards against double counting:
* Bonus is always computed from the *base* wage of hours actually worked; it is
  never computed on break pay.
* Penalty applies to base shift pay only (never to bonus or break pay).
* Protected break hours are never paid twice: they are excluded from worked
  hours and, at most, paid through ``break_pay`` at the compensation rate.
* Unpaid rest hours caused by blocked breaks are subtracted from worked hours
  only when compensation does not cover them.

Income retention = alternative / baseline * 100, with the baseline floored to
avoid division by zero.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .constants import PENALTY_RATE, PERFORMANCE_BONUS_RATE, UNPAID_REST_ALLOWANCE_HOURS


@dataclass
class IncomeResult:
    baseline_income: np.ndarray
    alternative_income: np.ndarray
    income_retention: np.ndarray          # percent
    income_loss_abs: np.ndarray           # currency per worker-shift
    unprotected_rest_hours: np.ndarray
    components: dict


def compute_income(
    policy,
    hourly_income,
    shift_hours,
    accessibility,
    work_intensity=None,
    break_need=None,
) -> IncomeResult:
    wage = np.maximum(np.asarray(hourly_income, dtype=float), 1e-6)
    shift = np.maximum(np.asarray(shift_hours, dtype=float), 0.25)
    access = np.clip(np.asarray(accessibility, dtype=float), 0.0, 1.0)

    p = policy
    flex = 1.0 if p.flexible_deadlines else 0.0
    protected_hours = np.minimum(p.protected_break_minutes / 60.0, shift * 0.5)
    protected_taken = protected_hours * access
    lost_share = protected_taken / shift

    # Rest a worker takes unpaid because breaks are not formally accessible.
    # Individual break need (sampled per worker) widens the distribution.
    need_factor = (
        np.clip(np.asarray(break_need, dtype=float), 0.0, 1.0) * 0.8 + 0.6
        if break_need is not None
        else 1.0
    )
    rest_pressure = (1.0 - access) * UNPAID_REST_ALLOWANCE_HOURS * need_factor
    # A paid-break entitlement means informally taken rest is still paid, so it
    # does not create an income loss even though it affects coverage.
    paid_entitlement = bool(getattr(p, "paid_breaks", False))
    unprotected_rest = np.where(
        paid_entitlement,
        0.0,
        np.where(
            p.break_compensation >= 0.999, 0.0, rest_pressure * (1.0 - p.break_compensation)
        ),
    )
    unprotected_rest = np.minimum(unprotected_rest, np.maximum(shift - protected_taken, 0.0))

    worked_hours = np.maximum(shift - protected_taken - unprotected_rest, 0.0)
    break_pay = wage * float(p.break_compensation) * protected_taken

    productivity = np.clip(1.0 - float(p.deadline_pressure) * lost_share * (1.0 - flex) * 0.75, 0.0, 1.0)
    bonus_alt = (
        wage
        * worked_hours
        * PERFORMANCE_BONUS_RATE
        * float(p.bonus_dependency)
        * productivity
    )
    bonus_base = wage * shift * PERFORMANCE_BONUS_RATE * float(p.bonus_dependency)

    penalty = (
        wage
        * shift
        * PENALTY_RATE
        * float(p.penalty_severity)
        * (1.0 - flex)
        * lost_share
        * float(p.deadline_pressure)
        * (1.0 - 0.5 * access)   # accessible breaks are defensible; blocked ones are penalised
    )

    baseline = wage * shift + bonus_base
    alternative = np.maximum(wage * worked_hours + break_pay + bonus_alt - penalty, 0.0)

    retention = np.where(baseline > 1e-9, 100.0 * alternative / np.maximum(baseline, 1e-9), 100.0)
    retention = np.clip(retention, 0.0, 200.0)
    loss = baseline - alternative

    return IncomeResult(
        baseline_income=baseline,
        alternative_income=alternative,
        income_retention=retention,
        income_loss_abs=loss,
        unprotected_rest_hours=unprotected_rest,
        components={
            "protected_break_hours_taken": protected_taken.tolist(),
            "worked_hours": worked_hours.tolist(),
            "break_pay": break_pay.tolist(),
            "bonus_baseline": bonus_base.tolist(),
            "bonus_alternative": bonus_alt.tolist(),
            "penalty": penalty.tolist(),
            "performance_bonus_rate": PERFORMANCE_BONUS_RATE,
            "penalty_rate": PENALTY_RATE,
            "unpaid_rest_allowance_hours": UNPAID_REST_ALLOWANCE_HOURS,
            "paid_break_entitlement": paid_entitlement,
        },
    )
