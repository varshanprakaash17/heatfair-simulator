# Methodology

## 1. What HeatFair is for

HeatFair is a **comparative policy simulator**. It answers questions of the form:

> "If this organisation changed its break entitlement, compensated rest and deadline
> flexibility, how would modelled exposure, income protection and operational disruption
> move for its outdoor workers under this heat scenario?"

It is not a forecast, not a monitoring system and not an occupational-safety assessment.

## 2. Design principles

1. **Policy first.** Every metric must respond to a policy lever. If a lever has no effect it
   does not belong in the builder. (The initial build failed this test — exposure ignored
   policy entirely — and was fixed before the UI was written.)
2. **One source of truth for coefficients.** All tunables live in `engine/constants.py` and
   are exported in the API's `assumptions` payload and the PDF.
3. **No hidden score.** Three objectives stay separate; the optimiser returns a frontier.
4. **Deterministic by construction.** Seeded generation everywhere; identical inputs and
   seeds reproduce identical numbers (covered by tests).
5. **Honest provenance.** Synthetic, estimated and provider data are labelled distinctly in
   the UI, the API payloads and the report.

## 3. Model development process

1. Started from the required relationships: heat exposure, financial incentive pressure,
   break availability, income, operational continuity.
2. Wrote each sub-model as a pure function with units documented and array inputs, so the
   population is vectorised rather than looped.
3. Calibrated coefficients by *directional sanity*, not by fitting: a no-protection policy
   should show low accessibility (~6%) and high exposure, a fully compensated policy should
   show high accessibility (~96%) and near-complete income retention (~99%).
4. Connected the sub-models in a deliberate order — incentive → accessibility → income →
   exposure → operational — because accessibility is an input to both income and exposure.
5. Built the optimiser on top of the same evaluation path, so a candidate score is directly
   comparable to a user-run simulation.
6. Wrote 90 tests, including dominance properties, constraint rejection, edge cases and
   reproducibility, then fixed two modelling defects the tests surfaced: a sign error in the
   financial-protection term (paying for breaks reduced accessibility) and a double-counting
   risk where full break entitlement was deducted even when it could not be taken.

## 4. Validation approach

| Area | Test |
| --- | --- |
| Heat index | monotone in temperature and humidity; plausible range; not labelled WBGT |
| Exposure | matches hand-computed formula; zero below reference; breaks and flexibility reduce it |
| Incentive | weights sum to 1; bounds respected; compensation lowers pressure; breakdown reconstructs index |
| Accessibility | bounded, monotone in each driver, finite at extremes |
| Income | retention = alternative/baseline; no double counting; zero-shift guard; bounded |
| Operational | range, monotonicity, availability cap, cost components |
| Population | deterministic per seed; supported sizes; documented ranges |
| Aggregation | percentile ordering, empty/NaN handling, histogram totals |
| Pareto | dominance definition, ties, frontier correctness, normalisation |
| Constraints | budget/protection/capacity/shift rejection, deterministic generation |
| Reproducibility | identical metrics for identical inputs; optimisation frontier stable |
| API | end-to-end run → results → optimise → apply → report, validation errors, 404s, CORS |

`pytest` from `backend/` runs all 90 tests in ~2.5 s.

## 5. Known limitations

* **Synthetic populations.** Distributions are plausible but not derived from a real
  workforce; results are not estimates of any specific organisation's people.
* **Heat index, not WBGT.** No solar load, wind, clothing or metabolic rate. Heat index
  cannot substitute for a workplace heat-stress assessment.
* **Uncalibrated behaviour.** Break accessibility and incentive sensitivity are illustrative
  relationships. They produce sensible ordering, not measured effect sizes.
* **Accounting-style income model.** No tax, benefits, overtime premia or contractual
  penalties; the daily income loss is a modelled wage gap.
* **Scenario scope.** The climate scenario sets the heat conditions and therefore the
  exposure objective. Break accessibility, income retention and operational disruption are
  driven by policy design, breaks and workload at that heat level, so changing the scenario
  moves exposure rather than every metric. This keeps policy comparison clean, but it means
  the model does not claim that income or staffing change with temperature on their own.
* **Single-day, static scenario.** No seasonality, acclimatisation over time, or adaptive
  behaviour; `simulation_duration_days` is stored but the engine evaluates one representative
  shift.
* **Cost model is illustrative.** Backfill and compensation costs exclude recruitment,
  overtime and service credits.
* **No authentication in the demo build.** Organisation scoping is by request parameter;
  RLS is documented but not enabled.
* **Open-Meteo dependency.** Weather loading requires network access; failures are explicit
  and do not fabricate data.

## 6. What would be needed to go further

1. Workplace heat measurements (WBGT or equivalent) and break-taking observations, to
   calibrate the accessibility logistic instead of assuming it.
2. Payroll data to replace the accounting-style income model with an actual earnings
   distribution.
3. A field pilot comparing two policies under the same conditions, with pre-registered
   outcomes, before any causal claim is made.
4. Occupational-health review of the exposure indicator and its thresholds.
5. Multi-day simulation with acclimatisation and adaptive scheduling.

Until then the honest framing is: **comparative, transparent, reproducible — and
illustrative**.
