-- HeatFair — PostgreSQL / Supabase schema
-- Mirrors backend/app/models.py (SQLAlchemy). SQLite is used for local development;
-- this file is the canonical DDL for a Supabase or managed Postgres deployment.
--
-- Apply with:  psql "$DATABASE_URL" -f database/schema.sql
-- Optional Supabase Auth row-level security: database/rls.sql
--
-- Design notes:
--   * Weather snapshots are immutable provenance records. retrieved_at is when
--     HeatFair called Open-Meteo; source_timestamp is the provider's own time.
--   * weather_type records whether values are modelled current conditions or a
--     forecast. HeatFair never stores invented readings as live weather.
--   * worker_profiles contains only synthetic, generated profiles.

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table if not exists organizations (
    id          uuid primary key default gen_random_uuid(),
    name        varchar(200) not null,
    created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------
create table if not exists policies (
    id                        uuid primary key default gen_random_uuid(),
    organization_id           uuid not null references organizations (id) on delete cascade,
    name                      varchar(200) not null,
    deadline_pressure         double precision not null default 0.5 check (deadline_pressure between 0 and 1),
    bonus_dependency          double precision not null default 0.5 check (bonus_dependency between 0 and 1),
    penalty_severity          double precision not null default 0.5 check (penalty_severity between 0 and 1),
    break_compensation        double precision not null default 0.0 check (break_compensation between 0 and 1),
    protected_break_minutes   double precision not null default 0.0 check (protected_break_minutes between 0 and 180),
    flexible_deadlines        boolean not null default false,
    paid_breaks               boolean not null default true,
    penalise_safety_delays    boolean not null default false,
    max_shift_hours           double precision not null default 10.0 check (max_shift_hours between 1 and 16),
    budget_limit              double precision not null default 15.0 check (budget_limit >= 0),
    created_at                timestamptz not null default now(),
    constraint uq_policies_org_name unique (organization_id, name)
);

create index if not exists ix_policies_org_created on policies (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- weather_snapshots
-- Every simulation points at the exact API payload used. No fabricated rows.
-- ---------------------------------------------------------------------------
create table if not exists weather_snapshots (
    id                 uuid primary key default gen_random_uuid(),
    location_name      varchar(240) not null,
    latitude           double precision not null check (latitude between -90 and 90),
    longitude          double precision not null check (longitude between -180 and 180),
    timezone           varchar(80),
    weather_source     varchar(80) not null default 'open-meteo',
    retrieved_at       timestamptz not null default now(),
    source_timestamp   varchar(80),
    weather_type       varchar(40) not null default 'forecast',
    forecast_date      varchar(20),
    current_conditions jsonb,
    hourly_conditions  jsonb,
    requested_hours    jsonb,
    units              jsonb,
    created_at         timestamptz not null default now()
);

create index if not exists ix_weather_snapshots_retrieved on weather_snapshots (retrieved_at desc);
create index if not exists ix_weather_snapshots_location on weather_snapshots (latitude, longitude);

-- ---------------------------------------------------------------------------
-- scenarios (legacy / reproducible synthetic scenarios and live snapshot links)
-- ---------------------------------------------------------------------------
create table if not exists scenarios (
    id                 uuid primary key default gen_random_uuid(),
    name               varchar(200) not null unique,
    temperature        double precision not null check (temperature between -30 and 60),
    humidity           double precision not null check (humidity between 0 and 100),
    work_duration      double precision not null default 8.0 check (work_duration between 1 and 16),
    work_intensity     varchar(32) not null default 'moderate'
                       check (work_intensity in ('light', 'moderate', 'heavy', 'very_heavy')),
    shift_start_hour   integer not null default 6 check (shift_start_hour between 0 and 23),
    hourly_conditions  jsonb,
    location           jsonb,
    source             varchar(64) not null default 'synthetic',
    created_at         timestamptz not null default now()
);

create index if not exists ix_scenarios_created on scenarios (created_at);

-- ---------------------------------------------------------------------------
-- worker_profiles (synthetic only; never store real personal data here)
-- ---------------------------------------------------------------------------
create table if not exists worker_profiles (
    id                     uuid primary key default gen_random_uuid(),
    organization_id        uuid not null references organizations (id) on delete cascade,
    label                  varchar(80),
    occupation             varchar(120) not null,
    hourly_income          double precision not null check (hourly_income >= 0),
    work_intensity         double precision not null check (work_intensity between 0 and 1),
    shift_hours            double precision not null check (shift_hours between 0.25 and 16),
    workload               double precision not null check (workload between 0 and 1),
    synthetic              boolean not null default true,
    synthetic_id           varchar(32) not null default 'W-0000',
    incentive_sensitivity  double precision not null default 0.5 check (incentive_sensitivity between 0 and 1),
    break_need             double precision not null default 0.5 check (break_need between 0 and 1),
    heat_tolerance         double precision not null default 1.0 check (heat_tolerance between 0.7 and 1.4),
    batch_seed             integer not null default 42,
    created_at             timestamptz not null default now()
);

create index if not exists ix_worker_profiles_org_created on worker_profiles (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- simulations
-- ---------------------------------------------------------------------------
create table if not exists simulations (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid not null references organizations (id) on delete cascade,
    policy_id           uuid not null references policies (id) on delete restrict,
    scenario_id         uuid not null references scenarios (id) on delete restrict,
    weather_snapshot_id uuid references weather_snapshots (id) on delete set null,
    status              varchar(24) not null default 'pending'
                        check (status in ('pending', 'running', 'completed', 'failed')),
    model_version       varchar(48) not null default 'heatfair-engine-1.0.0',
    random_seed         integer not null default 42 check (random_seed >= 0),
    configuration       jsonb not null default '{}'::jsonb,
    summary             jsonb,
    error               text,
    duration_ms         double precision,
    created_at          timestamptz not null default now()
);

create index if not exists ix_simulations_org_created on simulations (organization_id, created_at desc);
create index if not exists ix_simulations_policy on simulations (policy_id);
create index if not exists ix_simulations_scenario on simulations (scenario_id);
create index if not exists ix_simulations_weather_snapshot on simulations (weather_snapshot_id);

-- ---------------------------------------------------------------------------
-- simulation_results
-- ---------------------------------------------------------------------------
create table if not exists simulation_results (
    id            uuid primary key default gen_random_uuid(),
    simulation_id uuid not null references simulations (id) on delete cascade,
    metrics       jsonb not null,
    assumptions   jsonb not null,
    created_at    timestamptz not null default now()
);

create index if not exists ix_simulation_results_sim on simulation_results (simulation_id);

-- ---------------------------------------------------------------------------
-- policy_candidates
-- ---------------------------------------------------------------------------
create table if not exists policy_candidates (
    id                     uuid primary key default gen_random_uuid(),
    simulation_id          uuid not null references simulations (id) on delete cascade,
    candidate_key          varchar(64) not null default '',
    label                  varchar(160) not null default '',
    policy_configuration   jsonb not null,
    objective_values       jsonb not null,
    is_pareto_optimal      boolean not null default false,
    feasible               boolean not null default true,
    created_at             timestamptz not null default now()
);

create index if not exists ix_policy_candidates_sim_frontier
    on policy_candidates (simulation_id, is_pareto_optimal);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists reports (
    id            uuid primary key default gen_random_uuid(),
    simulation_id uuid not null references simulations (id) on delete cascade,
    report_url    varchar(500) not null,
    title         varchar(240) not null default 'HeatFair policy report',
    created_at    timestamptz not null default now()
);

create index if not exists ix_reports_simulation on reports (simulation_id);

commit;

-- Row-level security is intentionally not enabled here because the FastAPI
-- service connects with a server-side database role and scopes queries by
-- organization_id in application code. To expose Supabase directly to a
-- browser, apply database/rls.sql after wiring Supabase Auth. Never ship the
-- Supabase service-role key to the frontend; it bypasses RLS.
