-- HeatFair — optional Supabase Auth row-level security
--
-- Apply only after:
--   1. database/schema.sql has been applied; and
--   2. sign-in is wired and organization_members is populated by a trusted
--      server-side process (the FastAPI service or a Supabase admin action).
--
-- The FastAPI service uses a server-side database role and no service-role key
-- is shipped to the browser. This file protects direct Supabase client access.

begin;

create table if not exists organization_members (
    user_id         uuid not null,
    organization_id uuid not null references organizations (id) on delete cascade,
    role            varchar(24) not null default 'member'
                    check (role in ('owner', 'admin', 'member', 'viewer')),
    created_at      timestamptz not null default now(),
    primary key (user_id, organization_id)
);

alter table organization_members enable row level security;

drop policy if exists "members can read their memberships" on organization_members;
create policy "members can read their memberships"
    on organization_members for select
    using (user_id = auth.uid());

-- SECURITY DEFINER avoids recursive RLS evaluation when membership is checked
-- from policies on other tables.
create or replace function public.is_org_member(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from organization_members
        where organization_id = target_organization
          and user_id = auth.uid()
    );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

alter table organizations      enable row level security;
alter table policies          enable row level security;
alter table worker_profiles   enable row level security;
alter table simulations       enable row level security;
alter table simulation_results enable row level security;
alter table policy_candidates enable row level security;
alter table reports           enable row level security;
alter table weather_snapshots enable row level security;

drop policy if exists "members read their organizations" on organizations;
create policy "members read their organizations"
    on organizations for select
    using (public.is_org_member(id));

drop policy if exists "members manage their policies" on policies;
create policy "members manage their policies"
    on policies for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

drop policy if exists "members manage their worker profiles" on worker_profiles;
create policy "members manage their worker profiles"
    on worker_profiles for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

drop policy if exists "members manage their simulations" on simulations;
create policy "members manage their simulations"
    on simulations for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

drop policy if exists "members read results of their simulations" on simulation_results;
create policy "members read results of their simulations"
    on simulation_results for select
    using (
        exists (
            select 1 from simulations s
            where s.id = simulation_id
              and public.is_org_member(s.organization_id)
        )
    );

drop policy if exists "members read candidates of their simulations" on policy_candidates;
create policy "members read candidates of their simulations"
    on policy_candidates for select
    using (
        exists (
            select 1 from simulations s
            where s.id = simulation_id
              and public.is_org_member(s.organization_id)
        )
    );

drop policy if exists "members read reports of their simulations" on reports;
create policy "members read reports of their simulations"
    on reports for select
    using (
        exists (
            select 1 from simulations s
            where s.id = simulation_id
              and public.is_org_member(s.organization_id)
        )
    );

drop policy if exists "members read weather used by their simulations" on weather_snapshots;
create policy "members read weather used by their simulations"
    on weather_snapshots for select
    using (
        exists (
            select 1 from simulations s
            where s.weather_snapshot_id = weather_snapshots.id
              and public.is_org_member(s.organization_id)
        )
    );

commit;

-- Write access to results, candidates and reports is intentionally limited to
-- the server-side role. Browser clients should never insert simulation output
-- directly; they must call the FastAPI service, which validates inputs,
-- performs the simulation and records provenance.
