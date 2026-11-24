"""Break accessibility model.

Estimated probability-like accessibility that a worker can actually take a
protected rest break, from a logistic link:

    z = b0 + b1 * protected_availability + b2 * financial_protection
            - b3 * effective_incentive_pressure - b4 * workload_pressure
    A = 1 / (1 + exp(-z))

Paid break entitlement is *additive*: compensation raises the modelled
likelihood that a protected break is actually taken.

``protected_availability`` is the share of the shift formally covered by
protected breaks, relative to the 9-minutes-per-hour reference. All coefficients
are illustrative assumptions pending empirical validation; they are exposed in
``constants.BREAK_LOGISTIC`` so a reviewer can override them.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .constants import (
    BREAK_ACCESSIBILITY_CEILING,
    BREAK_ACCESSIBILITY_FLOOR,
    BREAK_LOGISTIC,
    BREAK_TARGET_MINUTES_PER_HOUR,
)


@dataclass
class BreakSettings:
    coefficients: dict = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.coefficients = dict(BREAK_LOGISTIC if self.coefficients is None else self.coefficients)


def protected_availability(protected_break_minutes, shift_hours) -> np.ndarray:
    """Coverage of protected breaks relative to the 9 min/hour reference.

    Values above 1 are clipped: extra break entitlement beyond the reference
    does not add protection in this model.
    """
    minutes = np.maximum(np.asarray(protected_break_minutes, dtype=float), 0.0)
    hours = np.maximum(np.asarray(shift_hours, dtype=float), 0.25)
    target = BREAK_TARGET_MINUTES_PER_HOUR * hours
    return np.atleast_1d(np.clip(minutes / np.maximum(target, 1e-6), 0.0, 1.0))


def break_accessibility(
    policy,
    shift_hours,
    workload,
    work_intensity,
    incentive_pressure,
    settings: BreakSettings | None = None,
) -> np.ndarray:
    """Logistic break accessibility in (0, 1), elementwise over workers."""
    settings = settings or BreakSettings()
    c = settings.coefficients

    protection = protected_availability(policy.protected_break_minutes, shift_hours)
    # A formal paid-break entitlement adds a small amount of financial
    # protection on top of the compensation rate (illustrative assumption).
    financial = float(
        np.clip(
            policy.break_compensation + (0.10 if getattr(policy, "paid_breaks", False) else 0.0),
            0.0,
            1.0,
        )
    )

    effective_incentive = np.asarray(incentive_pressure, dtype=float)
    workload_pressure = np.clip(np.asarray(workload, dtype=float), 0.0, 1.0) * (
        0.5 + 0.5 * np.clip(np.asarray(work_intensity, dtype=float), 0.0, 1.0)
    )

    z = (
        c["intercept"]
        + c["w_protection"] * protection
        + c["w_financial"] * financial
        - c["w_incentive"] * effective_incentive
        - c["w_workload"] * workload_pressure
    )
    a = 1.0 / (1.0 + np.exp(-z))
    return np.atleast_1d(np.clip(a, BREAK_ACCESSIBILITY_FLOOR, BREAK_ACCESSIBILITY_CEILING))


def break_accessibility_explained(
    policy,
    shift_hours: float,
    workload: float,
    work_intensity: float,
    incentive: float,
) -> dict:
    """Per-term decomposition of z, used in reports and methodology panels."""
    c = BreakSettings().coefficients
    protection = float(protected_availability(policy.protected_break_minutes, shift_hours)[0])
    wp = float(workload) * (0.5 + 0.5 * float(work_intensity))
    terms = {
        "intercept": c["intercept"],
        "protection": c["w_protection"] * protection,
        "financial_protection": c["w_financial"]
        * float(
            min(
                1.0,
                float(policy.break_compensation)
                + (0.10 if getattr(policy, "paid_breaks", False) else 0.0),
            )
        ),
        "incentive_pressure": -c["w_incentive"] * float(incentive),
        "workload_pressure": -c["w_workload"] * wp,
    }
    z = sum(terms.values())
    return {
        "z": round(z, 4),
        "accessibility": round(float(1.0 / (1.0 + np.exp(-z))), 4),
        "terms": {k: round(v, 4) for k, v in terms.items()},
        "coefficients": c,
        "protected_availability": round(protection, 4),
    }
