# HeatFair demo script (5–6 minutes)

The demo uses the seeded fictional organisation **Meridian Logistics**, 500 synthetic
workers, three policies and three climate scenarios. No database editing is required.

> Start both services first (see README). Keep `http://localhost:8000/docs` open in a second
> tab to show that the API is real.

---

## 0. Frame the problem (20 s)

> "When a delivery company pays a bonus for output and penalises late deadlines, rest becomes
> expensive for the worker. HeatFair asks a narrow, answerable question: if we change the
> policy, what happens to modelled exposure, income protection and operational continuity —
> and where do those three trade off?"

State the boundary immediately: synthetic workers, comparative estimates, heat index not WBGT.

## 1. Landing page (25 s)

Open `/`. Point at the tagline, the architecture strip and the model formulas. Mention that
the preview panel mirrors the live dashboard, and the badges say *synthetic* and *estimated*.

## 2. Dashboard (40 s)

Open `/dashboard`.

* 500 synthetic workers, current scenario 40 °C / 55 % RH.
* Exposure 82.1, accessibility 96.1 %, retention 99.1 %, efficiency 95.9 %.
* "Every one of these numbers is a stored simulation result. Nothing is hard-coded — you can
  stop the backend and this page shows an explicit error instead of fake data."

## 3. Policy builder (40 s)

Open `/policies`. Pick **Existing incentive-based policy**.

* Drag *Deadline pressure* and *Bonus dependency* up: the live incentive index rises.
* Set break compensation to 0 and protected minutes to 0: the summary warns that rest is
  financially penalised.
* Restore **Income-protection policy** and save. Point out the server-side index refresh.

## 4. Climate scenario editor (35 s)

Open `/scenarios`. Show the three saved scenarios and the hourly temperature/humidity chart.

* Optionally search a city and click *Load forecast conditions* to pull Open-Meteo data.
* Emphasise the source badge: synthetic vs provider. If offline, the error is explicit and
  synthetic scenarios still work.

## 5. Run a simulation (45 s)

Open `/simulate`.

* Policy: Income-protection · Scenario: Extreme heat · Population: 500 · Seed: 42.
* Click **Run simulation**. Note the measured engine time (~15–25 ms for 1,000 workers).
* Show the inline result: exposure 82.1, accessibility 96.1 %, retention 99.1 %.
* Mention reproducibility: the same policy, scenario and seed reproduce these numbers exactly.

## 6. Results (60 s)

Click **View results**.

* KPI deltas versus the no-protection baseline: exposure −7.2, accessibility +80.6 points,
  retention +4.5 points, disruption −3.6.
* Hourly chart: the shaded excess heat above the 26 °C reference.
* Distribution cards: per-worker spread, not just a mean.
* **Model transparency** tabs: formulas, coefficient values, limitations, seed and model
  version.
* Click **PDF report** to download the generated brief.

## 7. Policy optimiser — the flagship (90 s)

Open `/optimizer/{id}` (or click *Optimise policy*).

* 36 candidate policies generated from a seeded grid, 31 feasible, 11 Pareto-efficient.
* Explain dominance in one sentence: "no worse on all three objectives, strictly better on at
  least one."
* Hover the green points: each is a real engine evaluation, not a synthetic chart point.
* Sort/scan the table: protection-first buys exposure 80.3 at 0.9 % income loss; operations-first
  keeps disruption low with fewer break minutes.
* Tick two candidates to compare side by side.
* Select **Protection-first**, then click **Apply policy and run simulation**. The app creates a
  new policy row and immediately re-runs the same scenario and seed, landing on fresh results.

## 8. Reports and close (30 s)

Open `/reports`. Show the report preview, the included sections and the generated report
record. Download the PDF.

Close with the honest summary:

> "This is a comparative, reproducible policy simulator. The coefficients are illustrative,
> the workers are synthetic, and the heat metric is a heat index — not WBGT. What is real is
> the engine, the Pareto search and the audit trail."

---

## Likely questions

**Is this AI?** No. It is a deterministic simulation and optimisation engine; every number is
traceable to a formula in `docs/mathematical_model.md`.

**Are the coefficients validated?** No. They are illustrative and labelled as such in the API,
UI and PDF. Calibration would need field data.

**Why a frontier and not one score?** A composite score hides the trade-off the decision-maker
needs to see. The optimiser keeps the three objectives separate.

**Could this run on real data?** The population generator is isolated in `engine/workers.py`;
real (aggregate, non-personal) profiles could replace it. The model itself is unchanged.
