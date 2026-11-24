# HeatFair — pitch outline (8 slides, 5 minutes)

## Slide 1 — Title

**HeatFair** — Climate risk shouldn't become a worker's financial burden.

Climate-fairness policy simulation and multi-objective optimisation for organisations that
operate in heat.

## Slide 2 — Problem

* Heat is not only weather; it is a **policy outcome**.
* Output bonuses + deadline penalties + unpaid breaks make rest expensive for the worker.
* Organisations cannot see the interaction between incentive design and heat exposure until
  after the season.
* Existing tools are either weather dashboards or generic HR analytics — **neither connects
  a policy lever to a modelled worker outcome**.

## Slide 3 — Insight

Three things are coupled:

1. **Exposure** — how much excess heat a shift accumulates.
2. **Income** — what the worker actually takes home when they rest.
3. **Operations** — what the organisation loses when coverage drops.

Any policy that improves one usually moves the others. A single "fairness score" is a way of
hiding that decision.

## Slide 4 — Product

Four screens, one loop:

1. **Policy builder** — deadline pressure, bonus dependency, penalty severity, paid breaks,
   protected minutes, flexibility, budget.
2. **Climate scenario** — synthetic diurnal profile, custom hourly series, or live Open-Meteo.
3. **Simulation centre** — 100/500/1,000 synthetic workers, seeded, ~16–25 ms per run.
4. **Pareto optimiser** — 36 candidates evaluated by the engine, dominance-filtered, compared,
   applied and re-run.

Landing page → dashboard → policy → scenario → simulate → results → optimise → report.
Reports are generated server-side as a print-ready PDF.

## Slide 5 — The engine (what is actually built)

* Exposure: `E = Σ duration · intensity · max(0, heat index − T_ref)`, saturating 0–100 index.
* Incentive pressure: weighted, normalised, with a contribution breakdown.
* Break accessibility: logistic `A = 1/(1+e^-z)` over protection, pay, pressure and workload.
* Income: base wage + break pay + productivity-scaled bonus − penalty, with explicit rules
  preventing double counting.
* Operational disruption: coverage loss, workload pressure, availability loss.
* Population: seeded distributions, five occupations, no personal data.

All coefficients live in one file and are printed in the report.

## Slide 6 — Optimisation (demo moment)

* 36 candidates from presets + a seeded scrambled grid.
* Every candidate executed through the same engine as a user simulation.
* Constraints: budget, minimum protection, minimum operational capacity, maximum shift length.
* Pareto dominance: no worse on all three, strictly better on one.
* Result: e.g. **exposure 80.3 at 0.9 % income loss** vs **80.8 at 1.2 %** — real trade-offs,
  no invented points.

## Slide 7 — Credibility

* 90 automated tests: formulas, edge cases, dominance, constraints, reproducibility, API.
* Deterministic seeds; identical inputs reproduce identical outputs.
* Honest limits: heat index ≠ WBGT; coefficients illustrative; synthetic populations;
  comparative not causal; not occupational-safety certification.
* Provenance labels on every screen and in every PDF.

## Slide 8 — Impact and next steps

* Immediate use: pre-season policy review, budget conversations, heat-adaptation planning.
* Roadmap: WBGT inputs, multi-day acclimatisation, payroll-calibrated income model, field
  pilot with pre-registered outcomes, Supabase Auth + RLS for multi-tenant deployment.

**Ask:** pilot partner with a workforce that works in heat, and occupational-health review of
the exposure indicator.
