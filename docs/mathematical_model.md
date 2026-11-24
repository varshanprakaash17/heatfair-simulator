# HeatFair mathematical model

Every formula below is implemented in `backend/app/engine/`. All tunable coefficients live in
`backend/app/engine/constants.py` and are echoed in the API's `assumptions` block and in the
PDF report. Defaults are **illustrative assumptions**, not calibrated occupational-health
parameters.

Notation: `h` indexes shift hours, `w` indexes synthetic workers.

---

## 1. Environmental exposure estimator

### 1.1 Heat index (not WBGT)

For each hour, temperature `T` (°C) and relative humidity `RH` (%) are converted to a heat
index using the NWS/Rothfusz regression in Fahrenheit (Steadman apparent temperature in the
shade):

```
HI_F = -42.379 + 2.04901523 T_F + 10.14333127 RH - 0.22475541 T_F RH
       - 6.83783e-3 T_F² - 5.481717e-2 RH² + 1.22874e-3 T_F² RH
       + 8.5282e-4 T_F RH² - 1.99e-6 T_F² RH²
```

with the standard NWS low-humidity and high-humidity adjustments, and the simple Steadman
average below 80 °F. `HI = (HI_F − 32) × 5/9`.

This is a **heat-index estimate**. It is not WBGT, not a wet-bulb measurement and it ignores
solar radiation, wind speed, clothing and acclimatisation physiology. The UI and the report
repeat that on every screen.

### 1.2 Excess heat and exposure

```
E_w = Σ_h  duration_h · m(intensity_w) · max(0, HI_h − T_ref)
           · (exposure_hours_w / shift_hours_w) · s_flex
```

| Symbol | Meaning | Default |
| --- | --- | --- |
| `T_ref` | reference temperature above which heat counts as excess | 26 °C |
| `m(intensity)` | work-intensity multiplier, linear in normalised intensity | 0.8 → 1.6 |
| `exposure_hours` | shift hours actually spent in heat | shift − taken breaks |
| `s_flex` | re-sequencing factor when deadlines are flexible | 0.88, else 1.0 |

Break time removed from exposure:

```
exposure_hours_w = max(0.5, shift_hours_w − protected_hours_w · A_w − unpaid_rest_w)
```

with a small opportunistic shade-rest allowance for blocked breaks:

```
extra = (1 − A_w) · min(shift − exposure_hours, 0.25 h)
```

Units of `E`: **degree-Celsius-hours above reference**. It is comparative.

### 1.3 Comparative index

```
index_w = 100 · (1 − exp(−E_w / (shift_hours_w · 20)))
```

The saturation keeps mild and extreme scenarios readable without most values clipping at
100. It is monotone in `E`, so policy comparisons are preserved.

---

## 2. Incentive pressure

```
IP = 0.30·deadline_pressure + 0.30·bonus_dependency
   + 0.25·penalty_severity + 0.15·(1 − break_compensation)
```

All inputs are normalised to [0, 1], weights sum to 1, so `IP ∈ [0, 1]`; the API reports
`100·IP`. Per-worker effective pressure amplifies the policy value by incentive sensitivity:

```
IP_eff,w = IP · (0.75 + 0.5·sensitivity_w)
```

`incentive_breakdown()` returns each component's contribution and share of the total, which
the results page and the report display.

---

## 3. Break accessibility (logistic)

```
z_w = b0 + b1·P_w + b2·C − b3·IP_eff,w − b4·(W_w · (0.5 + 0.5·I_w))
A_w = 1 / (1 + exp(−z_w))
```

| Coefficient | Value | Meaning |
| --- | --- | --- |
| `b0` | −0.20 | baseline odds |
| `b1` | 3.20 | weight on protected-break coverage |
| `b2` | 1.50 | weight on financial protection (paid breaks) |
| `b3` | 2.20 | weight on effective incentive pressure |
| `b4` | 1.60 | weight on workload × intensity pressure |

Protected coverage is normalised against a 9-minutes-per-hour reference:

```
P_w = min(1, protected_break_minutes / (9 · shift_hours_w))
```

`A` is clipped to [0.01, 0.99] to keep downstream divisions safe. Coefficients are
**illustrative and unvalidated**; the API labels them as such.

---

## 4. Income impact

```
baseline_w    = wage_w · shift_w + wage_w · shift_w · 0.15 · bonus_dependency
protected_taken_w = protected_hours_w · A_w
unpaid_rest_w = (1 − A_w) · 0.5 h · (0.6 + 0.8·break_need_w) · (1 − compensation)
worked_hours_w = shift_w − protected_taken_w − unpaid_rest_w
break_pay_w   = wage_w · compensation · protected_taken_w
productivity_w = 1 − deadline_pressure · (protected_taken_w/shift_w) · (1 − flexible) · 0.75
bonus_alt_w   = wage_w · worked_hours_w · 0.15 · bonus_dependency · productivity_w
penalty_w     = wage_w · shift_w · 0.12 · penalty_severity · (1 − flexible)
                · (protected_taken_w/shift_w) · deadline_pressure · (1 − 0.5·A_w)
alternative_w = max(0, wage_w·worked_hours_w + break_pay_w + bonus_alt_w − penalty_w)

retention_w   = 100 · alternative_w / baseline_w
```

No double counting:

* bonus is computed from the **base wage of hours actually worked**, never from break pay;
* penalty applies to **base shift pay only**, never to bonus or break pay;
* protected break hours are removed from worked hours once and paid at most once, at the
  compensation rate;
* entitlement that is not taken (accessibility < 1) is not deducted from worked hours.

`retention` is clipped to [0, 200] and the baseline is floored at 1e-9 to avoid division by
zero. `shift_hours` is floored at 0.25.

---

## 5. Operational impact

```
rest_hours_w      = protected_hours_w · A_w + unpaid_rest_w
coverage_loss_w   = (rest_hours_w / shift_w) · (1 − 0.65·flexible)
workload_pressure_w = workload_w · coverage_loss_w
availability_loss_w = (1 − A_w) · 0.30
disruption_w      = 0.60·coverage_loss_w + 0.25·workload_pressure_w + 0.15·availability_loss_w
```

`disruption` is clipped to [0, 1] and reported as 0–100. `operational_efficiency = 100 −
disruption` is a convenience read-out, not a revenue model. Overtime cost, service-level
agreements and lost revenue are out of scope.

Illustrative protection cost per worker-shift:

```
cost = wage · compensation · protected_hours
     + wage · 0.60 · protected_hours · (0 if flexible else 1)
```

A candidate is infeasible if `cost > budget_limit`.

---

## 6. Worker population

Seeded NumPy generator. Occupation is drawn from fixed shares; wage is
`base_wage · LogNormal(0, 0.18)`; intensity is `base_intensity + N(0, 0.09)` clipped to
[0.15, 1]; shift hours are `N(8, 0.9)` clipped to [4, 11]; workload,
incentive sensitivity and break need are Beta-distributed; heat tolerance is
`N(1.0, 0.09)` clipped to [0.75, 1.3].

| Occupation | Base wage | Intensity | Share |
| --- | --- | --- | --- |
| Delivery rider | 12.5 | 0.72 | 34% |
| Warehouse loader | 11.0 | 0.80 | 22% |
| Construction helper | 13.5 | 0.88 | 18% |
| Field surveyor | 15.0 | 0.55 | 12% |
| Municipal maintenance | 12.0 | 0.68 | 14% |

Identifiers are synthetic (`W-0001`…). No personal data is requested or stored.

---

## 7. Aggregation

Per metric the API returns mean, median, min, max, standard deviation, p5/p10/p25/p50/p75/
p90/p95, a 12-bin histogram, and the share of workers above the threshold (exposure > 60) or
below 50% accessibility.

### Baseline counterfactual

The baseline is the **same policy with protection removed**: 0 protected break minutes, 0%
break compensation, no flexible deadlines. Incentive parameters are unchanged so the delta
isolates the effect of protection.

---

## 8. Multi-objective optimisation

Objectives (all minimised, original units preserved):

1. mean exposure index (0–100),
2. income loss `100 − retention` (%),
3. mean operational disruption (0–100).

**Dominance:** candidate `a` dominates `b` iff `a_k ≤ b_k` for every objective and
`a_k < b_k` for at least one. The frontier is the non-dominated set.

Candidate generation: four reference presets (current, protection-first, operations-first,
balanced) plus a seeded scrambled-grid sample over protected minutes, compensation,
flexibility, deadline pressure, penalty severity and shift scale. Every candidate is
evaluated by the engine; constraint-violating candidates are stored with their violations and
excluded from the frontier. No composite score is computed.

Normalisation for plotting: `(x − min)/(max − min)` over the evaluated set; reports use the
original units.

---

## 9. Worked example (regression fixture)

Hot scenario: 34 °C, 62% RH, 8 h, heavy intensity, 500 synthetic workers (seed 42).

| Policy | Exposure | Accessibility | Retention | Disruption |
| --- | --- | --- | --- | --- |
| Existing incentive-based | 71.4 | 6.5% | 94.1% | 8.5 |
| Protected-break | 63.8 | 81.6% | 93.7% | 3.6 |
| Income-protection | 61.8 | 96.1% | 99.1% | 4.1 |

The income-protection policy pays for breaks (better retention, higher accessibility) at a
higher cost per shift (16.18 vs 0.00), and the protected-break policy lands between them.
These numbers are produced by the engine and can be reproduced with
`backend/scripts/reproduce_example.py`.
