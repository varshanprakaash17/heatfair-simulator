"""Pareto dominance utilities.

Dominance: candidate A dominates B iff A is no worse than B on every objective
and strictly better on at least one. We minimise every objective.
"""

from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

from ..engine.constants import OBJECTIVES

OBJECTIVE_ORDER = ("exposure", "income_loss", "disruption")


def objectives_vector(record: dict, keys: Sequence[str] = OBJECTIVE_ORDER) -> np.ndarray:
    return np.array([float(record[k]) for k in keys], dtype=float)


def dominates(a, b) -> bool:
    """True if vector ``a`` Pareto-dominates vector ``b`` (minimisation)."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if a.shape != b.shape:
        raise ValueError("Objective vectors must have the same length")
    if not (np.all(np.isfinite(a)) and np.all(np.isfinite(b))):
        raise ValueError("Objective vectors must be finite")
    return bool(np.all(a <= b) and np.any(a < b))


def pareto_front(records: Iterable[dict], keys: Sequence[str] = OBJECTIVE_ORDER) -> list[dict]:
    """Return the non-dominated subset, preserving input order.

    Ties (identical objective vectors) are all kept as non-dominated, but only
    one of them is reported as ``dominated_by_other`` in the annotated list.
    """
    items = list(records)
    vectors = [objectives_vector(r, keys) for r in items]
    keep = []
    for i, vec in enumerate(vectors):
        dominated = False
        for j, other in enumerate(vectors):
            if i == j:
                continue
            if dominates(other, vec):
                dominated = True
                break
        if not dominated:
            keep.append(items[i])
    return keep


def annotate(records: Iterable[dict], keys: Sequence[str] = OBJECTIVE_ORDER) -> list[dict]:
    """Annotate each record with is_pareto_optimal and dominated_by."""
    items = list(records)
    vectors = [objectives_vector(r, keys) for r in items]
    out = []
    for i, record in enumerate(items):
        dominated_by = None
        is_optimal = True
        for j, other in enumerate(vectors):
            if i == j:
                continue
            if dominates(other, vectors[i]):
                is_optimal = False
                if dominated_by is None:
                    dominated_by = items[j].get("id")
        enriched = dict(record)
        enriched["is_pareto_optimal"] = is_optimal
        enriched["dominated_by"] = dominated_by
        out.append(enriched)
    return out


def objective_ranges(records: Iterable[dict], keys: Sequence[str] = OBJECTIVE_ORDER) -> dict:
    """Min/max per objective, used for normalised frontier plotting."""
    items = list(records)
    if not items:
        return {k: {"min": 0.0, "max": 1.0} for k in keys}
    out = {}
    for k in keys:
        vals = np.array([float(r[k]) for r in items], dtype=float)
        vals = vals[np.isfinite(vals)]
        lo = float(vals.min()) if vals.size else 0.0
        hi = float(vals.max()) if vals.size else 1.0
        out[k] = {"min": lo, "max": hi}
    return out


def normalise(record: dict, ranges: dict, keys: Sequence[str] = OBJECTIVE_ORDER) -> dict:
    """Map objective values to 0-1 within the observed candidate set."""
    out = {}
    for k in keys:
        lo = ranges[k]["min"]
        hi = ranges[k]["max"]
        span = hi - lo
        out[k] = 0.0 if span <= 1e-12 else float((float(record[k]) - lo) / span)
    return out


def describe_objectives() -> dict:
    return dict(OBJECTIVES)
