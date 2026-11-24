# HeatFair architecture

## 1. Shape of the system

HeatFair is a **modular monolith**: one Next.js app, one FastAPI service, one relational
database. There are no microservices, queues or background workers, because a 500-worker
simulation takes ~50 ms and a 36-candidate Pareto search takes ~100 ms on a laptop. Adding
infrastructure would make the demo harder to run, not more credible.

```
Browser
  │  Next.js App Router (TypeScript, Tailwind, shadcn/ui, Recharts)
  │
  │  fetch  /api/v1/*        (JSON, CORS-restricted)
  ▼
FastAPI service
  ├─ api/           HTTP layer: health, organizations, policies, scenarios, workers,
  │                 simulations, reports, weather, dashboard, demo bootstrap
  ├─ schemas/       Pydantic request/response validation
  ├─ services/      orchestration, seeding, PDF reports, insights, serialisation
  ├─ optimizer/     candidate generation, Pareto dominance, constraint handling
  └─ engine/        pure NumPy simulation modules
       exposure · incentive · breaks · income · operational
       workers · scenario · aggregator · simulation (orchestrator)
  │
  ▼
SQLAlchemy models → SQLite (local) or PostgreSQL / Supabase (deployed)
```

The engine has **no** dependency on FastAPI, SQLAlchemy or the database. That is deliberate:
it is the part that must be testable and auditable in isolation, and 70 of the 90 tests
exercise it directly.

## 2. Request flow for a simulation

1. `POST /api/v1/simulations/run` with organisation, policy, scenario, population size,
   seed and duration.
2. The service loads the policy and scenario rows, converts them into engine specs
   (`PolicySpec`, `ScenarioSpec`) and generates a seeded synthetic population
   (`generate_workers`).
3. `run_simulation` evaluates the policy and a **no-protection baseline** on the same
   population and scenario.
4. Metrics, hourly series, per-occupation breakdown, assumptions and limitations are stored
   in `simulation_results`; a compact summary is stored on `simulations` for fast listing.
5. The API returns the full result bundle; the UI also re-reads it from
   `GET /simulations/{id}/results`, which is the same stored payload.

## 3. Request flow for optimisation

1. `POST /simulations/{id}/optimize` loads the base policy/scenario and rebuilds the
   population from the stored `population_seed` (so the comparison is like-for-like).
2. `generate_candidates` produces reference presets plus a seeded scrambled-grid sample.
3. Each candidate is converted to a `PolicySpec` and evaluated by `quick_evaluate`, which
   runs the same engine path as a full simulation (no baseline pass).
4. Constraints (budget, minimum accessibility, minimum efficiency, maximum shift length)
   are applied; violations are stored with the candidate.
5. `pareto_front` keeps only non-dominated candidates; every candidate row is persisted in
   `policy_candidates` with its objective values and `is_pareto_optimal` flag.
6. `GET /pareto` rebuilds the same payload from storage, so the frontier survives restarts.

Applying a candidate (`POST /simulations/{id}/apply`) creates a **new policy row** from the
candidate configuration and runs a fresh simulation against the same scenario and seed. No
policy is mutated in place, which keeps history auditable.

## 4. Persistence model

| Table | Purpose | Key relationships |
| --- | --- | --- |
| `organizations` | Tenant boundary | parent of policies, workers, simulations |
| `policies` | Normalised workplace policy | `(organization_id, name)` unique |
| `scenarios` | Global climate scenario library | referenced by simulations |
| `worker_profiles` | Persisted synthetic population | scoped by organisation |
| `simulations` | Run metadata, configuration JSON, summary | FK to policy and scenario |
| `simulation_results` | Full metrics + assumptions JSON | 1:many (latest is read) |
| `policy_candidates` | Evaluated candidates, objectives, frontier flag | FK to simulation |
| `reports` | Generated PDF records | FK to simulation |

JSON columns are used for configuration, metrics, assumptions, candidate objectives and
scenario hourly series. The relational columns cover everything the UI filters or joins on.

SQLite is the development default so the demo runs with zero setup. `database/schema.sql`
is the Postgres/Supabase DDL, including CHECK constraints, indexes and a commented RLS
block for when Supabase Auth is added.

## 5. Frontend structure

```
app/
  page.tsx                       landing page
  (workspace)/layout.tsx         sidebar shell + workspace provider
  (workspace)/dashboard/         aggregated overview (one endpoint)
  (workspace)/policies/          policy builder (RHF + Zod, live summary)
  (workspace)/scenarios/         scenario editor, hourly grid, Open-Meteo
  (workspace)/simulate/          run configuration + status
  (workspace)/results/[id]/      metrics, charts, assumptions, PDF
  (workspace)/optimizer/[id]/    Pareto frontier, compare, apply & re-run
  (workspace)/reports/           report preview and downloads
components/ui/                   shadcn-style primitives (Radix + CVA)
components/charts/               Recharts wrappers with a shared dark theme
lib/api.ts                       typed API client with explicit errors
lib/workspace.tsx                bootstrap + policy/scenario cache
```

`WorkspaceProvider` calls `/demo/bootstrap` once. Pages never hard-code metrics: the
dashboard, results and optimiser screens all read stored simulation output.

## 6. External services

* **Open-Meteo** (no key): geocoding and hourly temperature/humidity. Optional; failures are
  surfaced as an explicit error and synthetic scenarios remain fully functional. Responses
  are cached in-process for 15 minutes.
* **Supabase / Postgres** (optional): swap `DATABASE_URL`. The API is the only component
  that talks to the database, so the service-role key never reaches the browser.
* **ReportLab**: PDF generation is server-side and synchronous; files are written to
  `backend/reports/` and recorded in `reports`.

## 7. Deliberate trade-offs

* **Synchronous simulation.** Fast enough for the supported population sizes and far simpler
  to demo. The UI still shows an execution state and the measured duration.
* **No authentication in the demo.** Every request carries an organisation id, which is a
  single-tenant simplification. `schema.sql` documents the RLS path for multi-tenant use.
* **Approximate SQL seed.** `database/seed.sql` reproduces a plausible population for
  Postgres, but the engine's seeded generator is the authoritative demo data.
* **No composite objective score.** The optimiser returns a frontier; the decision stays
  with the user. This is a product requirement, not an omission.
