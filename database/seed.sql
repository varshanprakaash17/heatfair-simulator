-- HeatFair demo seed (PostgreSQL / Supabase)
--
-- All entities and values are fictional and illustrative.
-- For the local SQLite demo the API seeds itself on start-up; this file is for a
-- managed Postgres deployment applied after schema.sql.
--
-- The canonical 500-worker population lives in data/sample_workers.json and is
-- generated deterministically by the engine. The block at the bottom reproduces a
-- 500-profile population in SQL for convenience; it is approximate and is not the
-- same sample used by the Python engine.

begin;

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
insert into organizations (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Meridian Logistics (fictional)')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
insert into policies (
    id, organization_id, name, deadline_pressure, bonus_dependency,
    penalty_severity, break_compensation, protected_break_minutes,
    flexible_deadlines, budget_limit
) values
    ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111',
     'Existing incentive-based policy', 0.82, 0.85, 0.70, 0.00, 0, false, 20.0),
    ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111111',
     'Protected-break policy', 0.45, 0.60, 0.35, 0.50, 60, true, 22.0),
    ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111111',
     'Income-protection policy', 0.25, 0.40, 0.15, 1.00, 75, true, 30.0)
on conflict (organization_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Climate scenarios (synthetic diurnal profile applied by the engine)
-- ---------------------------------------------------------------------------
insert into scenarios (
    id, name, temperature, humidity, work_duration, work_intensity,
    shift_start_hour, hourly_conditions, location, source
) values
    ('33333333-3333-4333-8333-333333333301', 'Normal working conditions', 27.0, 52.0, 8.0,
     'moderate', 7, null,
     '{"name": "Riverton (fictional)", "latitude": 12.97, "longitude": 77.59}'::jsonb, 'synthetic'),
    ('33333333-3333-4333-8333-333333333302', 'Hot working conditions', 34.0, 62.0, 8.0,
     'heavy', 6, null,
     '{"name": "Riverton (fictional)", "latitude": 12.97, "longitude": 77.59}'::jsonb, 'synthetic'),
    ('33333333-3333-4333-8333-333333333303', 'Extreme heat scenario', 40.0, 55.0, 9.0,
     'very_heavy', 6, null,
     '{"name": "Riverton (fictional)", "latitude": 12.97, "longitude": 77.59}'::jsonb, 'synthetic')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 500 synthetic workers (approximate reconstruction; the engine's version is
-- authoritative). Replace this block with POST /api/v1/workers/generate if you
-- want the exact seeded population used by the demo.
-- ---------------------------------------------------------------------------
select setseed(0.42);

insert into worker_profiles (
    organization_id, occupation, hourly_income, work_intensity, shift_hours,
    workload, synthetic, synthetic_id, incentive_sensitivity, break_need,
    heat_tolerance, batch_seed
)
select
    '11111111-1111-4111-8111-111111111111',
    occupation,
    round((base_wage * (0.85 + random() * 0.35))::numeric, 2),
    round(least(1.0, greatest(0.15, base_intensity + (random() - 0.5) * 0.18))::numeric, 3),
    round(least(11.0, greatest(4.0, 8.0 + (random() - 0.5) * 1.8))::numeric, 2),
    round(random()::numeric, 3),
    true,
    'W-' || lpad(generate_series::text, 4, '0'),
    round(random()::numeric, 3),
    round(random()::numeric, 3),
    round((0.95 + random() * 0.12)::numeric, 3),
    42
from generate_series(1, 500) as idx
cross join lateral (
    select
        case
            when idx % 100 < 34 then 'Delivery rider'
            when idx % 100 < 56 then 'Warehouse loader'
            when idx % 100 < 74 then 'Construction helper'
            when idx % 100 < 86 then 'Field surveyor'
            else 'Municipal maintenance'
        end as occupation,
        case
            when idx % 100 < 34 then 12.5
            when idx % 100 < 56 then 11.0
            when idx % 100 < 74 then 13.5
            when idx % 100 < 86 then 15.0
            else 12.0
        end as base_wage,
        case
            when idx % 100 < 34 then 0.72
            when idx % 100 < 56 then 0.80
            when idx % 100 < 74 then 0.88
            when idx % 100 < 86 then 0.55
            else 0.68
        end as base_intensity
) as profile
where not exists (
    select 1 from worker_profiles
    where organization_id = '11111111-1111-4111-8111-111111111111'
);

commit;

-- After seeding, open the app and run a simulation from the UI, or:
--   curl -X POST http://localhost:8000/api/v1/simulations/run \
--     -H "Content-Type: application/json" \
--     -d '{"organization_id":"11111111-1111-4111-8111-111111111111",
--          "policy_id":"<policy uuid>","scenario_id":"<scenario uuid>",
--          "population_size":500,"random_seed":42,"simulation_duration_days":1}'
