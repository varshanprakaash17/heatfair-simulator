"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

WORK_INTENSITIES = ("light", "moderate", "heavy", "very_heavy")
SCENARIO_SOURCES = ("synthetic", "open-meteo", "custom-hourly", "scenario_hourly_conditions")


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------
class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------
class PolicyBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    deadline_pressure: float = Field(0.5, ge=0.0, le=1.0)
    bonus_dependency: float = Field(0.5, ge=0.0, le=1.0)
    penalty_severity: float = Field(0.5, ge=0.0, le=1.0)
    break_compensation: float = Field(0.0, ge=0.0, le=1.0, description="Fraction of wage paid during protected breaks")
    protected_break_minutes: float = Field(0.0, ge=0.0, le=240.0)
    flexible_deadlines: bool = False
    paid_breaks: bool = True
    penalise_safety_delays: bool = False
    max_shift_hours: float = Field(10.0, ge=1.0, le=16.0)
    budget_limit: float = Field(15.0, ge=0.0, le=100000.0)


class PolicyCreate(PolicyBase):
    organization_id: str


class PolicyUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    deadline_pressure: float | None = Field(None, ge=0.0, le=1.0)
    bonus_dependency: float | None = Field(None, ge=0.0, le=1.0)
    penalty_severity: float | None = Field(None, ge=0.0, le=1.0)
    break_compensation: float | None = Field(None, ge=0.0, le=1.0)
    protected_break_minutes: float | None = Field(None, ge=0.0, le=240.0)
    flexible_deadlines: bool | None = None
    paid_breaks: bool | None = None
    penalise_safety_delays: bool | None = None
    max_shift_hours: float | None = Field(None, ge=1.0, le=16.0)
    budget_limit: float | None = Field(None, ge=0.0, le=100000.0)


class PolicyOut(PolicyBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    created_at: datetime
    incentive_pressure_index: float = 0.0


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------
class HourlyConditionIn(BaseModel):
    hour: int = Field(ge=0, le=23)
    temperature: float = Field(ge=-40.0, le=60.0)
    humidity: float = Field(ge=0.0, le=100.0)


class LocationIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    latitude: float | None = Field(None, ge=-90.0, le=90.0)
    longitude: float | None = Field(None, ge=-180.0, le=180.0)
    country: str | None = Field(None, max_length=120)
    timezone: str | None = Field(None, max_length=80)


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    temperature: float = Field(..., ge=-30.0, le=60.0)
    humidity: float = Field(..., ge=0.0, le=100.0)
    work_duration: float = Field(8.0, ge=1.0, le=16.0)
    work_intensity: Literal["light", "moderate", "heavy", "very_heavy"] = "moderate"
    shift_start_hour: int = Field(6, ge=0, le=23)
    hourly_conditions: list[HourlyConditionIn] | None = None
    location: LocationIn | None = None
    source: str = Field("synthetic", max_length=64)

    @field_validator("hourly_conditions")
    @classmethod
    def _check_hourly(cls, value):
        if value is not None and len(value) > 24:
            raise ValueError("At most 24 hourly conditions may be supplied")
        if value:
            hours = [c.hour for c in value]
            if len(set(hours)) != len(hours):
                raise ValueError("Hourly conditions must use unique hour values")
        return value


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    temperature: float
    humidity: float
    work_duration: float
    work_intensity: str
    shift_start_hour: int
    hourly_conditions: list | None
    location: dict | None
    source: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Workers
# ---------------------------------------------------------------------------
class WorkerGenerateRequest(BaseModel):
    organization_id: str
    size: int = Field(500, ge=1, le=5000)
    seed: int = Field(42, ge=0, le=2_147_483_647)
    persist: bool = True

    @field_validator("size")
    @classmethod
    def _size_supported(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Population size must be at least 1")
        return value


class WorkerProfileFields(BaseModel):
    """Editable attributes of a worker profile (ranges match the engine)."""

    label: str | None = Field(None, max_length=80, description="Optional non-identifying name, e.g. 'Rider A'")
    occupation: str = Field(..., min_length=2, max_length=120)
    hourly_income: float = Field(..., ge=0.0, le=10_000.0)
    work_intensity: float = Field(..., ge=0.15, le=1.0)
    shift_hours: float = Field(..., ge=0.25, le=16.0)
    workload: float = Field(..., ge=0.0, le=1.0)
    incentive_sensitivity: float = Field(..., ge=0.0, le=1.0)
    break_need: float = Field(..., ge=0.0, le=1.0)
    heat_tolerance: float = Field(..., ge=0.75, le=1.3)


class WorkerCreateRequest(WorkerProfileFields):
    organization_id: str


class WorkerUpdateRequest(BaseModel):
    label: str | None = Field(None, max_length=80)
    occupation: str | None = Field(None, min_length=2, max_length=120)
    hourly_income: float | None = Field(None, ge=0.0, le=10_000.0)
    work_intensity: float | None = Field(None, ge=0.15, le=1.0)
    shift_hours: float | None = Field(None, ge=0.25, le=16.0)
    workload: float | None = Field(None, ge=0.0, le=1.0)
    incentive_sensitivity: float | None = Field(None, ge=0.0, le=1.0)
    break_need: float | None = Field(None, ge=0.0, le=1.0)
    heat_tolerance: float | None = Field(None, ge=0.75, le=1.3)


class WorkerProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str | None = None
    synthetic_id: str
    occupation: str
    hourly_income: float
    work_intensity: float
    shift_hours: float
    workload: float
    incentive_sensitivity: float
    break_need: float
    heat_tolerance: float
    synthetic: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Simulations
# ---------------------------------------------------------------------------
class SimulationRunRequest(BaseModel):
    organization_id: str
    policy_id: str
    scenario_id: str | None = Field(
        None, description="Stored scenario; omit when running against live weather coordinates"
    )
    latitude: float | None = Field(None, ge=-90.0, le=90.0)
    longitude: float | None = Field(None, ge=-180.0, le=180.0)
    location_name: str | None = Field(None, max_length=240)
    work_start_hour: int = Field(6, ge=0, le=23)
    work_end_hour: int = Field(14, ge=1, le=24)
    population_size: int = Field(500, ge=10, le=5000)
    random_seed: int = Field(42, ge=0, le=2_147_483_647)
    simulation_duration_days: int = Field(1, ge=1, le=30)
    population_seed: int | None = Field(None, ge=0, le=2_147_483_647)
    include_saved_workers: bool = Field(
        True, description="Include worker profiles saved for this organization in the population"
    )
    label: str | None = Field(None, max_length=120)

    @model_validator(mode="after")
    def _label_default(self):
        if self.population_seed is None:
            self.population_seed = self.random_seed
        if self.scenario_id is None:
            if self.latitude is None or self.longitude is None:
                raise ValueError(
                    "Provide either scenario_id or both latitude and longitude for live weather"
                )
        if self.work_end_hour <= self.work_start_hour:
            raise ValueError("work_end_hour must be later than work_start_hour")
        return self


class SimulationSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    policy_id: str
    scenario_id: str
    weather_snapshot_id: str | None = None
    status: str
    model_version: str
    random_seed: int
    configuration: dict
    summary: dict | None
    error: str | None
    duration_ms: float | None
    created_at: datetime


class SimulationRunResponse(BaseModel):
    simulation: SimulationSummaryOut
    results: dict


class SimulationResultOut(BaseModel):
    simulation_id: str
    status: str
    model_version: str
    policy: dict | None
    scenario: dict | None
    metrics: dict
    charts: dict | None = None
    assumptions: dict
    limitations: list[str]
    reproducibility: dict | None = None
    created_at: datetime | None = None


# ---------------------------------------------------------------------------
# Optimization
# ---------------------------------------------------------------------------
class OptimizeRequest(BaseModel):
    candidate_count: int = Field(36, ge=4, le=120)
    seed: int = Field(42, ge=0, le=2_147_483_647)
    minimize_exposure_weight: float = Field(0.0, ge=0.0, le=1.0, description="Presentation only; objectives stay separate")
    constraints: dict | None = None
    population_size: int = Field(400, ge=50, le=2000)


class ParetoResponse(BaseModel):
    simulation_id: str
    generated: int
    evaluated: int
    feasible: int
    constraints: dict
    ranges: dict
    candidates: list[dict]
    frontier: list[dict]
    notes: list[str]
    seed: int


class ApplyCandidateRequest(BaseModel):
    """Create a policy from an optimised candidate and run a new simulation."""

    candidate_id: str = Field(..., description="Candidate key, e.g. cand-protection")
    run_simulation: bool = True
    population_size: int = Field(500, ge=10, le=5000)


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
class WeatherResponse(BaseModel):
    source: str
    cached: bool
    location: dict
    hourly: list[dict]
    fetched_at: datetime


class WeatherSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    location_name: str
    latitude: float
    longitude: float
    timezone: str | None
    weather_source: str
    retrieved_at: datetime
    source_timestamp: str | None
    weather_type: str
    forecast_date: str | None
    current_conditions: dict | None
    hourly_conditions: dict | None
    requested_hours: dict | None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str
    timestamp: datetime
