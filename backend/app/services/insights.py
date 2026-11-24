"""Deterministic, rule-based recommendations derived from simulation metrics.

These are interpretive heuristics on top of the model output -- never a claim of
causal certainty. Each recommendation carries the metric that triggered it so
the UI and the PDF report can explain *why* it was shown.
"""

from __future__ import annotations


def build_recommendations(metrics: dict, policy: dict, scenario: dict | None = None) -> list[dict]:
    recs: list[dict] = []
    delta = metrics.get("delta_vs_baseline") or {}
    exposure = float(metrics.get("exposure_index", 0.0))
    access = float(metrics.get("break_accessibility", 0.0))
    retention = float(metrics.get("income_retention", 100.0))
    disruption = float(metrics.get("operational_disruption", 0.0))
    incentive = float(metrics.get("incentive_pressure_index", 0.0))
    low_access_share = float(metrics.get("workers_with_low_accessibility", 0.0))
    above_60 = float(metrics.get("workers_exposed_above_60", 0.0))

    if access < 65.0:
        recs.append(
            {
                "title": "Increase protected break entitlement",
                "severity": "high" if access < 50 else "medium",
                "metric": f"Break accessibility {access:.1f}%",
                "rationale": (
                    "Modelled break accessibility is below the 65% planning threshold. "
                    "Raising protected break minutes increases the logistic protection term "
                    "without changing the incentive structure."
                ),
                "action": (
                    f"Add {max(15, int(90 - float(policy.get('protected_break_minutes', 0))))} "
                    "minutes of protected break per shift"
                    if float(policy.get("protected_break_minutes", 0)) < 90
                    else "Protect the existing break entitlement in scheduling rules"
                ),
            }
        )

    if incentive > 45.0:
        recs.append(
            {
                "title": "Decouple bonuses from heat-hour output",
                "severity": "high" if incentive > 65 else "medium",
                "metric": f"Incentive pressure {incentive:.1f}/100",
                "rationale": (
                    "Bonus dependency and deadline pressure together weight "
                    f"{incentive:.0f}/100 on the policy-pressure scale, which lowers modelled "
                    "break accessibility and raises income risk during breaks."
                ),
                "action": "Re-base performance bonuses on attendance hours instead of output during heat windows",
            }
        )

    if retention < 95.0:
        recs.append(
            {
                "title": "Compensate protected break time",
                "severity": "high" if retention < 88 else "medium",
                "metric": f"Income retention {retention:.1f}%",
                "rationale": (
                    "Restricted hours reduce base pay unless protected breaks are compensated. "
                    "The estimator separates base wage, break pay and bonus so the gap is attributable."
                ),
                "action": "Pay protected breaks at 100% of the hourly wage",
            }
        )

    if disruption > 12.0 and not policy.get("flexible_deadlines"):
        recs.append(
            {
                "title": "Introduce flexible deadlines during heat windows",
                "severity": "medium",
                "metric": f"Operational disruption {disruption:.1f}/100",
                "rationale": (
                    "Coverage loss is weighted 0.55 in the disruption model. Deadline flexibility "
                    "removes that penalty term and the associated backfill cost."
                ),
                "action": "Allow same-day deadline extensions when heat index exceeds the reference",
            }
        )

    if above_60 > 20.0:
        recs.append(
            {
                "title": "Shift the working window away from peak heat",
                "severity": "high" if above_60 > 45 else "medium",
                "metric": f"{above_60:.0f}% of workers above exposure index 60",
                "rationale": (
                    "Exposure is the integral of excess heat above the reference temperature, so "
                    "moving hours out of the hottest part of the day lowers it directly."
                ),
                "action": "Start shifts 60-90 minutes earlier where operations allow",
            }
        )

    if low_access_share > 35.0:
        recs.append(
            {
                "title": "Audit break coverage at the worker level",
                "severity": "medium",
                "metric": f"{low_access_share:.0f}% of workers below 50% accessibility",
                "rationale": (
                    "Low individual accessibility is concentrated in high-workload, high-intensity "
                    "profiles; population averages hide this segment."
                ),
                "action": "Re-sequence the highest-workload tasks away from peak heat hours",
            }
        )

    if delta.get("income_retention", 0.0) > 0 and exposure > 55.0:
        recs.append(
            {
                "title": "Prefer exposure reduction before further income protection",
                "severity": "low",
                "metric": f"Exposure index {exposure:.1f}",
                "rationale": (
                    "The current policy already improves income retention relative to its no-protection "
                    "baseline; the binding constraint in this scenario is heat exposure rather than pay."
                ),
                "action": "Compare frontier candidates that trade a small income gain for lower exposure",
            }
        )

    if not recs:
        recs.append(
            {
                "title": "Policy performs within modelled thresholds",
                "severity": "low",
                "metric": f"Exposure {exposure:.1f} · Access {access:.1f}% · Retention {retention:.1f}%",
                "rationale": (
                    "All monitored indicators sit inside their planning thresholds for this "
                    "scenario and population. Continue monitoring as heat conditions change."
                ),
                "action": "Re-run the simulation against the extreme-heat scenario for stress testing",
            }
        )
    return recs[:5]


def summarize_frontier(frontier: list[dict]) -> list[dict]:
    """Compact frontier rows for comparison tables and reports."""
    rows = []
    for cand in frontier:
        obj = cand.get("objectives", {})
        pol = cand.get("policy", {})
        rows.append(
            {
                "id": cand.get("id"),
                "label": cand.get("label"),
                "exposure": obj.get("exposure"),
                "income_loss": obj.get("income_loss"),
                "disruption": obj.get("disruption"),
                "protected_break_minutes": pol.get("protected_break_minutes"),
                "break_compensation": pol.get("break_compensation"),
                "deadline_pressure": pol.get("deadline_pressure"),
                "flexible_deadlines": pol.get("flexible_deadlines"),
                "cost_per_worker_shift": cand.get("supporting_metrics", {}).get(
                    "cost_per_worker_shift"
                ),
            }
        )
    return rows
