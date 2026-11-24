"""Model coefficients and documented assumptions for the HeatFair simulation engine.

Every coefficient in this file is an *illustrative assumption* chosen so the
model behaves in a directionally sensible way. None of them are validated
occupational-health parameters. They are centralised here so that reviewers can
see, and override, the complete set of tunables.

Sources of inspiration (not calibration): published heat-index regression
(Rothfusz / NWS), and qualitative findings from heat-and-labour economics
literature. We do not claim any of these numbers reproduce field measurements.
"""

from __future__ import annotations

MODEL_VERSION = "heatfair-engine-1.0.0"

# ---------------------------------------------------------------------------
# Environmental exposure
# ---------------------------------------------------------------------------

#: Heat index above which additional heat is counted as excess exposure (deg C).
EXPOSURE_REFERENCE_C = 26.0

#: Work-intensity multipliers applied to excess heat (0 -> sedentary, 1 -> very heavy).
INTENSITY_MULTIPLIER_MIN = 0.8
INTENSITY_MULTIPLIER_MAX = 1.6

#: Scale of the saturating 0-100 comparative exposure index:
#: index = 100 * (1 - exp(-E / (shift_hours * EXPOSURE_INDEX_SCALE_C))).
#: The saturation avoids clipping most realistic scenarios at 100 and keeps
#: differences between policies visible.
EXPOSURE_INDEX_SCALE_C = 20.0
EXCESS_REFERENCE_C = 15.0

#: Residual factor on excess heat when deadlines are flexible (work is
#: re-sequenced into cooler parts of the day). Illustrative scheduling assumption.
EXPOSURE_FLEXIBILITY_FACTOR = 0.88

#: Share of the shift during which opportunistic shade rest is still taken even
#: when formal breaks are inaccessible, used only to avoid overstating exposure.
OPPORTUNISTIC_REST_HOURS = 0.25

#: Synthetic diurnal profile used when a scenario has no hourly conditions.
#: Temperature offset (deg C) and relative-humidity offset (points) by hour of day.
DIURNAL_TEMPERATURE_OFFSET = {
    0: -4.2, 1: -4.8, 2: -5.2, 3: -5.4, 4: -5.0, 5: -4.0,
    6: -2.6, 7: -1.2, 8: 0.2, 9: 1.4, 10: 2.4, 11: 3.1,
    12: 3.6, 13: 3.9, 14: 4.0, 15: 3.7, 16: 3.0, 17: 2.0,
    18: 0.8, 19: -0.6, 20: -1.9, 21: -2.9, 22: -3.6, 23: -4.0,
}
DIURNAL_HUMIDITY_OFFSET = {
    0: 9.0, 1: 10.0, 2: 10.5, 3: 10.0, 4: 9.0, 5: 7.5,
    6: 5.0, 7: 2.0, 8: -1.0, 9: -4.0, 10: -7.0, 11: -9.5,
    12: -11.0, 13: -12.0, 14: -12.5, 15: -12.0, 16: -10.0, 17: -7.0,
    18: -3.5, 19: 0.0, 20: 3.0, 21: 5.5, 22: 7.5, 23: 8.5,
}

# ---------------------------------------------------------------------------
# Incentive pressure
# ---------------------------------------------------------------------------
#: Weights must sum to 1.0. Break compensation is inverted: paying for breaks
#: reduces financial pressure.
INCENTIVE_WEIGHTS = {
    "deadline_pressure": 0.30,
    "bonus_dependency": 0.30,
    "penalty_severity": 0.25,
    "uncompensated_break": 0.15,
}

# ---------------------------------------------------------------------------
# Break accessibility (logistic)
# ---------------------------------------------------------------------------
#: z = intercept + w_protection*protection + w_financial*financial
#:                  - w_incentive*incentive - w_workload*workload
#: Financial protection is additive: paid breaks raise the modelled likelihood
#: that a break is actually taken.
BREAK_LOGISTIC = {
    "intercept": -0.20,
    "w_protection": 3.20,
    "w_financial": 1.50,
    "w_incentive": 2.20,
    "w_workload": 1.60,
    "incentive_sensitivity_floor": 0.75,
    "incentive_sensitivity_span": 0.50,
}

#: Protected break minutes counted as "fully protective" per hour of shift.
BREAK_TARGET_MINUTES_PER_HOUR = 9.0

#: Minimum / maximum modelled accessibility so results stay strictly inside (0, 1).
BREAK_ACCESSIBILITY_FLOOR = 0.01
BREAK_ACCESSIBILITY_CEILING = 0.99

# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------
#: Performance bonus, as a fraction of base wage, available at full productivity.
PERFORMANCE_BONUS_RATE = 0.15

#: Maximum penalty deduction, as a fraction of shift base pay, at severity 1.0.
PENALTY_RATE = 0.12

#: Unpaid rest pressure: extra rest hours a worker takes when breaks are blocked.
UNPAID_REST_ALLOWANCE_HOURS = 0.5

# ---------------------------------------------------------------------------
# Operational impact
# ---------------------------------------------------------------------------
OPERATIONAL_WEIGHTS = {
    "coverage_loss": 0.60,
    "workload_pressure": 0.25,
    "availability": 0.15,
}

#: Unplanned absence share at zero break accessibility.
AVAILABILITY_LOSS_AT_ZERO_ACCESS = 0.30

#: Share of the coverage penalty that flexible deadlines remove.
FLEXIBILITY_COVERAGE_RELIEF = 0.65

# ---------------------------------------------------------------------------
# Optimisation
# ---------------------------------------------------------------------------
#: Backfill staffing cost factor: fraction of hourly wage paid for replacement
#: coverage during protected breaks (illustrative).
BACKFILL_COST_FACTOR = 0.60

#: Bounds used when generating candidate policies.
OPTIMIZER_BOUNDS = {
    "protected_break_minutes": (0.0, 120.0),
    "break_compensation": (0.0, 1.0),
    "deadline_pressure": (0.0, 1.0),
    "penalty_severity": (0.0, 1.0),
    "shift_scale": (0.80, 1.05),
}

#: Constraint thresholds applied to candidate policies.
OPTIMIZER_CONSTRAINTS = {
    "min_break_accessibility": 55.0,   # percent
    "min_operational_efficiency": 72.0,  # percent
    "max_shift_hours": 10.0,
}

#: Objective keys, used consistently by the API, the UI and reports.
OBJECTIVES = {
    "exposure": "Environmental exposure index (0-100, lower is better)",
    "income_loss": "Income loss (% of baseline income, lower is better)",
    "disruption": "Operational disruption index (0-100, lower is better)",
}
