"""Aggregation of per-worker simulation outcomes into policy-level metrics."""

from __future__ import annotations

import numpy as np

PERCENTILES = (5, 10, 25, 50, 75, 90, 95)


def summarize(values) -> dict:
    """Mean/median/min/max/percentiles plus finite-safe guards."""
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {
            "mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0,
            "std": 0.0, "percentiles": {f"p{p}": 0.0 for p in PERCENTILES},
            "count": 0,
        }
    pct = np.percentile(arr, PERCENTILES)
    return {
        "mean": round(float(arr.mean()), 4),
        "median": round(float(np.median(arr)), 4),
        "min": round(float(arr.min()), 4),
        "max": round(float(arr.max()), 4),
        "std": round(float(arr.std(ddof=0)), 4),
        "percentiles": {f"p{p}": round(float(v), 4) for p, v in zip(PERCENTILES, pct)},
        "count": int(arr.size),
    }


def histogram(values, bins: int = 12, value_range: tuple[float, float] | None = None) -> dict:
    """Histogram payload for distribution charts (counts + bin edges)."""
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {"bins": [], "counts": [], "labels": []}
    if value_range is None and float(arr.max() - arr.min()) < 1e-6:
        # Constant distributions (e.g. every worker at 100% retention) would
        # otherwise produce zero-width bins and make numpy raise.
        value_range = (float(arr.min()) - 0.5, float(arr.max()) + 0.5)
        bins = 1
    counts, edges = np.histogram(arr, bins=bins, range=value_range)
    labels = [f"{edges[i]:.1f}-{edges[i + 1]:.1f}" for i in range(len(edges) - 1)]
    return {
        "bins": [round(float(e), 3) for e in edges],
        "counts": [int(c) for c in counts],
        "labels": labels,
    }


def aggregate(
    exposure_index,
    accessibility,
    income_retention,
    income_loss_abs,
    disruption_index,
    efficiency,
    unprotected_rest_hours,
    incentive_index: float,
    policy_cost: dict,
    baseline: dict | None = None,
) -> dict:
    """Build the policy-level metric block returned by the API."""
    exposure = np.asarray(exposure_index, dtype=float)
    access = np.asarray(accessibility, dtype=float)
    retention = np.asarray(income_retention, dtype=float)
    loss = np.asarray(income_loss_abs, dtype=float)
    disruption = np.asarray(disruption_index, dtype=float)

    metrics = {
        "exposure_index": round(float(np.mean(exposure)), 3),
        "exposure_stats": summarize(exposure),
        "exposure_distribution": histogram(exposure, bins=12, value_range=(0.0, 100.0)),
        "incentive_pressure_index": round(float(incentive_index), 3),
        "break_accessibility": round(float(np.mean(access) * 100.0), 3),
        "break_accessibility_stats": summarize(access * 100.0),
        "income_retention": round(float(np.mean(retention)), 3),
        "income_retention_stats": summarize(retention),
        "income_retention_distribution": histogram(retention, bins=12),
        "income_loss_per_worker_shift": round(float(np.mean(loss)), 3),
        "total_daily_income_loss": round(float(np.sum(loss)), 2),
        "operational_disruption": round(float(np.mean(disruption)), 3),
        "operational_efficiency": round(float(np.mean(efficiency)), 3),
        "unpaid_rest_hours_mean": round(float(np.mean(unprotected_rest_hours)), 4),
        "workers_exposed_above_60": round(
            float(np.mean(exposure > 60.0) * 100.0), 3
        ),
        "workers_with_low_accessibility": round(float(np.mean(access < 0.5) * 100.0), 3),
        "policy_cost": policy_cost,
        "population": {"workers": int(exposure.size)},
    }

    if baseline is not None:
        metrics["baseline"] = baseline
        metrics["delta_vs_baseline"] = {
            "exposure_index": round(metrics["exposure_index"] - baseline["exposure_index"], 3),
            "break_accessibility": round(
                metrics["break_accessibility"] - baseline["break_accessibility"], 3
            ),
            "income_retention": round(
                metrics["income_retention"] - baseline["income_retention"], 3
            ),
            "operational_disruption": round(
                metrics["operational_disruption"] - baseline["operational_disruption"], 3
            ),
            "operational_efficiency": round(
                metrics["operational_efficiency"] - baseline["operational_efficiency"], 3
            ),
        }
    return metrics
