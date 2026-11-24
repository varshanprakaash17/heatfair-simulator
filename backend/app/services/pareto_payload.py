"""Assemble the Pareto response payload consumed by the optimiser UI."""

from __future__ import annotations


def optimization_payload(
    simulation,
    candidates: list[dict],
    frontier: list[dict],
    ranges: dict,
    constraints: dict,
    generated: int,
    evaluated: int,
    feasible: int,
    notes: list[str],
    seed: int,
) -> dict:
    return {
        "simulation_id": simulation.id,
        "generated": generated,
        "evaluated": evaluated,
        "feasible": feasible,
        "constraints": constraints,
        "ranges": ranges,
        "candidates": candidates,
        "frontier": frontier,
        "notes": notes,
        "seed": seed,
        "completed_at": ((simulation.configuration or {}).get("optimization") or {}).get(
            "completed_at"
        ),
        "objective_labels": {
            "exposure": "Environmental exposure index",
            "income_loss": "Income loss (% of baseline)",
            "disruption": "Operational disruption index",
        },
    }
