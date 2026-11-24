"""Synthetic outdoor-worker population generator.

Profiles are sampled from documented distributions with a seeded NumPy
Generator, so identical (size, seed, config) inputs always produce identical
populations. No real worker data is used, requested or stored; identifiers are
synthetic (``W-0001`` ...) and carry no personal meaning.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

#: Occupation catalogue: base hourly wage (currency units), intensity, share.
OCCUPATIONS = [
    {"name": "Delivery rider", "wage": 12.5, "intensity": 0.72, "share": 0.34},
    {"name": "Warehouse loader", "wage": 11.0, "intensity": 0.80, "share": 0.22},
    {"name": "Construction helper", "wage": 13.5, "intensity": 0.88, "share": 0.18},
    {"name": "Field surveyor", "wage": 15.0, "intensity": 0.55, "share": 0.12},
    {"name": "Municipal maintenance", "wage": 12.0, "intensity": 0.68, "share": 0.14},
]

DEFAULT_PROFILE_CONFIG = {
    "wage_sigma": 0.18,            # lognormal sigma on occupation wage
    "shift_hours_mean": 8.0,
    "shift_hours_sigma": 0.9,
    "shift_hours_min": 4.0,
    "shift_hours_max": 11.0,
    "workload_alpha": 2.2,         # Beta(a, b) for workload
    "workload_beta": 2.4,
    "intensity_sigma": 0.09,
    "income_volatility_sigma": 0.10,
    "incentive_sensitivity_alpha": 2.6,
    "incentive_sensitivity_beta": 2.2,
    "break_need_alpha": 2.4,
    "break_need_beta": 2.8,
    "heat_tolerance_mean": 1.0,
    "heat_tolerance_sigma": 0.09,
}


@dataclass
class WorkerPopulation:
    ids: list[str]
    occupations: list[str]
    hourly_income: np.ndarray
    work_intensity: np.ndarray
    shift_hours: np.ndarray
    workload: np.ndarray
    incentive_sensitivity: np.ndarray
    break_need: np.ndarray
    heat_tolerance: np.ndarray
    seed: int
    config: dict = field(default_factory=dict)

    @property
    def size(self) -> int:
        return len(self.ids)

    def to_records(self) -> list[dict]:
        return [
            {
                "synthetic_id": self.ids[i],
                "occupation": self.occupations[i],
                "hourly_income": round(float(self.hourly_income[i]), 2),
                "work_intensity": round(float(self.work_intensity[i]), 3),
                "shift_hours": round(float(self.shift_hours[i]), 2),
                "workload": round(float(self.workload[i]), 3),
                "incentive_sensitivity": round(float(self.incentive_sensitivity[i]), 3),
                "break_need": round(float(self.break_need[i]), 3),
                "heat_tolerance": round(float(self.heat_tolerance[i]), 3),
                "synthetic": True,
            }
            for i in range(self.size)
        ]

    def summary(self) -> dict:
        return {
            "size": self.size,
            "mean_hourly_income": round(float(np.mean(self.hourly_income)), 2),
            "mean_shift_hours": round(float(np.mean(self.shift_hours)), 2),
            "mean_work_intensity": round(float(np.mean(self.work_intensity)), 3),
            "mean_workload": round(float(np.mean(self.workload)), 3),
            "occupations": _occupation_counts(self.occupations),
            "seed": self.seed,
            "synthetic": True,
        }


def _occupation_counts(occupations: list[str]) -> dict:
    counts: dict[str, int] = {}
    for name in occupations:
        counts[name] = counts.get(name, 0) + 1
    return counts


def population_from_profiles(profiles) -> WorkerPopulation:
    """Build a population from stored worker-profile rows.

    Used for profiles the user added themselves; they are appended to the
    generated synthetic population so a simulation reflects the saved roster.
    """
    if not profiles:
        raise ValueError("At least one stored worker profile is required")
    return WorkerPopulation(
        ids=[p.synthetic_id for p in profiles],
        occupations=[p.occupation for p in profiles],
        hourly_income=np.array([p.hourly_income for p in profiles], dtype=float),
        work_intensity=np.array([p.work_intensity for p in profiles], dtype=float),
        shift_hours=np.array([p.shift_hours for p in profiles], dtype=float),
        workload=np.array([p.workload for p in profiles], dtype=float),
        incentive_sensitivity=np.array([p.incentive_sensitivity for p in profiles], dtype=float),
        break_need=np.array([p.break_need for p in profiles], dtype=float),
        heat_tolerance=np.array([p.heat_tolerance for p in profiles], dtype=float),
        seed=0,
        config={"source": "saved_profiles"},
    )


def merge_populations(*populations: WorkerPopulation) -> WorkerPopulation:
    """Concatenate populations while keeping their row arrays aligned."""
    items = [p for p in populations if p is not None and p.size > 0]
    if not items:
        raise ValueError("No worker populations to merge")
    if len(items) == 1:
        return items[0]
    base = items[0]
    return WorkerPopulation(
        ids=[worker_id for p in items for worker_id in p.ids],
        occupations=[occupation for p in items for occupation in p.occupations],
        hourly_income=np.concatenate([p.hourly_income for p in items]),
        work_intensity=np.concatenate([p.work_intensity for p in items]),
        shift_hours=np.concatenate([p.shift_hours for p in items]),
        workload=np.concatenate([p.workload for p in items]),
        incentive_sensitivity=np.concatenate([p.incentive_sensitivity for p in items]),
        break_need=np.concatenate([p.break_need for p in items]),
        heat_tolerance=np.concatenate([p.heat_tolerance for p in items]),
        seed=base.seed,
        config={
            **base.config,
            "saved_profiles": sum(
                len(p.ids) for p in items if p.config.get("source") == "saved_profiles"
            ),
        },
    )


def generate_workers(
    size: int = 500,
    seed: int = 42,
    config: dict | None = None,
    occupations: list[dict] | None = None,
) -> WorkerPopulation:
    """Sample a deterministic synthetic population."""
    if size < 1:
        raise ValueError("Population size must be at least 1")
    if size > 20000:
        raise ValueError("Population size above 20000 is not supported")
    if seed < 0:
        raise ValueError("Random seed must be non-negative")

    cfg = {**DEFAULT_PROFILE_CONFIG, **(config or {})}
    rng = np.random.default_rng(seed)
    catalogue = occupations or OCCUPATIONS

    shares = np.array([o["share"] for o in catalogue], dtype=float)
    shares = shares / shares.sum()
    assigned = rng.choice(len(catalogue), size=size, p=shares)

    wages = np.empty(size)
    intensities = np.empty(size)
    names: list[str] = []
    for idx, occ in enumerate(catalogue):
        mask = assigned == idx
        count = int(mask.sum())
        if count == 0:
            continue
        wages[mask] = occ["wage"] * rng.lognormal(mean=0.0, sigma=cfg["wage_sigma"], size=count)
        intensities[mask] = np.clip(
            occ["intensity"] + rng.normal(0.0, cfg["intensity_sigma"], size=count) , 0.15, 1.0
        )
        names.extend([occ["name"]] * count)

    # Keep occupation labels aligned with their sampled row indices.
    occupation_names = [catalogue[i]["name"] for i in assigned]

    shift = np.clip(
        rng.normal(cfg["shift_hours_mean"], cfg["shift_hours_sigma"], size),
        cfg["shift_hours_min"],
        cfg["shift_hours_max"],
    )
    workload = rng.beta(cfg["workload_alpha"], cfg["workload_beta"], size)
    incentive_sensitivity = rng.beta(
        cfg["incentive_sensitivity_alpha"], cfg["incentive_sensitivity_beta"], size
    )
    break_need = rng.beta(cfg["break_need_alpha"], cfg["break_need_beta"], size)
    heat_tolerance = np.clip(
        rng.normal(cfg["heat_tolerance_mean"], cfg["heat_tolerance_sigma"], size), 0.75, 1.3
    )

    order = np.argsort(wages, kind="stable")
    ids = [f"W-{rank + 1:04d}" for rank in range(size)]

    return WorkerPopulation(
        ids=ids,
        occupations=[occupation_names[i] for i in order],
        hourly_income=wages[order].round(4),
        work_intensity=intensities[order].round(4),
        shift_hours=shift[order].round(4),
        workload=workload[order].round(4),
        incentive_sensitivity=incentive_sensitivity[order].round(4),
        break_need=break_need[order].round(4),
        heat_tolerance=heat_tolerance[order].round(4),
        seed=seed,
        config={**cfg, "occupations": catalogue},
    )
