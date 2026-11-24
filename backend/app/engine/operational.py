"""Operational-impact model.

Disruption blends coverage loss, workload pressure and availability loss:

    rest_hours         = (protected break hours taken) + (unpaid rest hours)
    coverage_loss      = rest_hours / shift_hours * (1 - 0.65 * flexible)
    workload_pressure  = workload * coverage_loss
    availability_loss  = (1 - accessibility) * 0.30

    disruption = 0.60 * coverage_loss
               + 0.25 * workload_pressure
               + 0.15 * availability_loss

Index 0-100 (lower is better); ``operational_efficiency`` = 100 - disruption is
a convenience read-out, not a revenue model. The model does not estimate
overtime cost, service-level agreements or lost revenue.
"""

from __future__ import annotations

import numpy as np

from .constants import (
    AVAILABILITY_LOSS_AT_ZERO_ACCESS,
    BACKFILL_COST_FACTOR,
    FLEXIBILITY_COVERAGE_RELIEF,
    OPERATIONAL_WEIGHTS,
)


def operational_disruption(
    policy,
    shift_hours,
    workload,
    accessibility,
    unprotected_rest_hours=None,
) -> dict:
    shift = np.maximum(np.asarray(shift_hours, dtype=float), 0.25)
    wl = np.clip(np.asarray(workload, dtype=float), 0.0, 1.0)
    access = np.clip(np.asarray(accessibility, dtype=float), 0.0, 1.0)

    flex = 1.0 if policy.flexible_deadlines else 0.0
    protected_hours = np.minimum(float(policy.protected_break_minutes) / 60.0, shift * 0.5)
    # Breaks are only lost from coverage to the extent they are actually taken.
    protected_taken = protected_hours * access
    unpaid = (
        np.clip(np.asarray(unprotected_rest_hours, dtype=float), 0.0, shift)
        if unprotected_rest_hours is not None
        else np.zeros_like(shift)
    )
    rest_hours = np.clip(protected_taken + unpaid, 0.0, shift)
    break_share = rest_hours / shift

    coverage_loss = np.clip(break_share * (1.0 - FLEXIBILITY_COVERAGE_RELIEF * flex), 0.0, 1.0)
    workload_pressure = np.clip(wl * coverage_loss, 0.0, 1.0)
    availability_loss = (1.0 - access) * AVAILABILITY_LOSS_AT_ZERO_ACCESS

    disruption = (
        OPERATIONAL_WEIGHTS["coverage_loss"] * coverage_loss
        + OPERATIONAL_WEIGHTS["workload_pressure"] * workload_pressure
        + OPERATIONAL_WEIGHTS["availability"] * availability_loss
    )
    disruption = np.clip(disruption, 0.0, 1.0)

    return {
        "disruption": disruption,
        "disruption_index": disruption * 100.0,
        "efficiency": (1.0 - disruption) * 100.0,
        "coverage_loss": coverage_loss * 100.0,
        "workload_pressure": workload_pressure * 100.0,
        "availability_loss": availability_loss * 100.0,
        "rest_hours": rest_hours,
        "weights": OPERATIONAL_WEIGHTS,
        "assumption": (
            f"flexible deadlines remove {FLEXIBILITY_COVERAGE_RELIEF:.0%} of the coverage penalty; "
            f"availability loss caps at {AVAILABILITY_LOSS_AT_ZERO_ACCESS:.0%}"
        ),
    }


def policy_cost_per_shift(policy, mean_hourly_income: float, shift_hours: float) -> dict:
    """Illustrative cost of the protection package, per worker-shift.

    Two components, both configurable:
    * paid break compensation: wage * break_compensation * protected_hours
    * backfill staffing: wage * 0.60 * protected_hours * (1 - flexible)
    """
    protected_hours = min(float(policy.protected_break_minutes) / 60.0, shift_hours * 0.5)
    wage = max(float(mean_hourly_income), 0.0)
    compensation = wage * float(policy.break_compensation) * protected_hours
    backfill = wage * BACKFILL_COST_FACTOR * protected_hours * (0.0 if policy.flexible_deadlines else 1.0)
    total = compensation + backfill
    return {
        "break_compensation_cost": round(compensation, 4),
        "backfill_cost": round(backfill, 4),
        "total_cost_per_worker_shift": round(total, 4),
        "budget_limit": round(float(policy.budget_limit), 4),
        "within_budget": total <= float(policy.budget_limit) + 1e-9,
    }
