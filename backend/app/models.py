"""SQLAlchemy models mirroring database/schema.sql.

Identifiers are UUID strings so the same schema works on SQLite and Postgres
without dialect-specific types. JSON columns hold simulation configuration and
results; on Postgres they map to JSONB-compatible JSON.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    policies: Mapped[list["Policy"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    simulations: Mapped[list["Simulation"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    members: Mapped[list["OrganizationMember"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    deadline_pressure: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    bonus_dependency: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    penalty_severity: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    break_compensation: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    protected_break_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    flexible_deadlines: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    paid_breaks: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    penalise_safety_delays: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_shift_hours: Mapped[float] = mapped_column(Float, nullable=False, default=10.0)
    budget_limit: Mapped[float] = mapped_column(Float, nullable=False, default=15.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    organization: Mapped[Organization] = relationship(back_populates="policies")
    simulations: Mapped[list["Simulation"]] = relationship(back_populates="policy")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_policies_org_name"),
        Index("ix_policies_org_created", "organization_id", "created_at"),
    )


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    humidity: Mapped[float] = mapped_column(Float, nullable=False)
    work_duration: Mapped[float] = mapped_column(Float, nullable=False, default=8.0)
    work_intensity: Mapped[str] = mapped_column(String(32), nullable=False, default="moderate")
    shift_start_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    hourly_conditions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    location: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    simulations: Mapped[list["Simulation"]] = relationship(back_populates="scenario")

    __table_args__ = (Index("ix_scenarios_created", "created_at"),)


class WorkerProfile(Base):
    __tablename__ = "worker_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    occupation: Mapped[str] = mapped_column(String(120), nullable=False)
    hourly_income: Mapped[float] = mapped_column(Float, nullable=False)
    work_intensity: Mapped[float] = mapped_column(Float, nullable=False)
    shift_hours: Mapped[float] = mapped_column(Float, nullable=False)
    workload: Mapped[float] = mapped_column(Float, nullable=False)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    synthetic_id: Mapped[str] = mapped_column(String(32), nullable=False, default="W-0000")
    incentive_sensitivity: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    break_need: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    heat_tolerance: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    batch_seed: Mapped[int] = mapped_column(Integer, nullable=False, default=42)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    __table_args__ = (Index("ix_worker_profiles_org_created", "organization_id", "created_at"),)


class WeatherSnapshot(Base):
    """Immutable record of the weather data a simulation was executed against."""

    __tablename__ = "weather_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    location_name: Mapped[str] = mapped_column(String(240), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    weather_source: Mapped[str] = mapped_column(String(80), nullable=False, default="open-meteo")
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    source_timestamp: Mapped[str | None] = mapped_column(String(80), nullable=True)
    weather_type: Mapped[str] = mapped_column(String(40), nullable=False, default="forecast")
    forecast_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    current_conditions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    hourly_conditions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    requested_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    units: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    simulations: Mapped[list["Simulation"]] = relationship(back_populates="weather_snapshot")


class Simulation(Base):
    __tablename__ = "simulations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    policy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("policies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    scenario_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scenarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    weather_snapshot_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("weather_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    model_version: Mapped[str] = mapped_column(String(48), nullable=False, default="heatfair-engine-1.0.0")
    random_seed: Mapped[int] = mapped_column(Integer, nullable=False, default=42)
    configuration: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    organization: Mapped[Organization] = relationship(back_populates="simulations")
    policy: Mapped[Policy] = relationship(back_populates="simulations")
    scenario: Mapped[Scenario] = relationship(back_populates="simulations")
    weather_snapshot: Mapped["WeatherSnapshot | None"] = relationship(back_populates="simulations")
    results: Mapped[list["SimulationResult"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan"
    )
    candidates: Mapped[list["PolicyCandidate"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_simulations_org_created", "organization_id", "created_at"),)


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)
    assumptions: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    simulation: Mapped[Simulation] = relationship(back_populates="results")


class PolicyCandidate(Base):
    __tablename__ = "policy_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidate_key: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    label: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    policy_configuration: Mapped[dict] = mapped_column(JSON, nullable=False)
    objective_values: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_pareto_optimal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    feasible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    simulation: Mapped[Simulation] = relationship(back_populates="candidates")

    __table_args__ = (
        Index("ix_policy_candidates_sim_frontier", "simulation_id", "is_pareto_optimal"),
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    report_url: Mapped[str] = mapped_column(String(500), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False, default="HeatFair policy report")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    simulation: Mapped[Simulation] = relationship(back_populates="reports")


class OrganizationMember(Base):
    """Join table: authenticated Freebuff users belong to organizations."""

    __tablename__ = "organization_members"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    organization: Mapped[Organization] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")

    __table_args__ = (
        Index("ix_org_members_org", "organization_id"),
        Index("ix_org_members_user", "user_id"),
    )


class User(Base):
    """Invite-only staff/worker account, identified by email.

    Accounts are created by an organization owner or admin; there is no public
    sign-up. Organization access is decided solely by ``OrganizationMember``
    rows, so this table carries identity and credentials only.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    memberships: Mapped[list["OrganizationMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    """Opaque login session referenced by the HTTP-only session cookie."""

    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    user: Mapped["User"] = relationship(back_populates="sessions")
