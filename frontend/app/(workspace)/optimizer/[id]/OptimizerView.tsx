"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Info,
  Loader2,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import type { Candidate, ParetoResponse, SimulationSummary } from "@/lib/types";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { CHART, axisProps, gridProps } from "@/components/charts/theme";

const CANDIDATE_COUNTS = [24, 48, 72, 96];

const PARAMS: { key: keyof Candidate["policy"]; label: string; format: (value: unknown) => string }[] = [
  { key: "protected_break_minutes", label: "Protected break", format: (value) => `${value} min` },
  { key: "break_compensation", label: "Break compensation", format: (value) => `${Math.round(Number(value) * 100)}%` },
  { key: "deadline_pressure", label: "Deadline pressure", format: (value) => `${Math.round(Number(value) * 100)}%` },
  { key: "bonus_dependency", label: "Bonus dependency", format: (value) => `${Math.round(Number(value) * 100)}%` },
  { key: "penalty_severity", label: "Penalty severity", format: (value) => `${Math.round(Number(value) * 100)}%` },
  { key: "flexible_deadlines", label: "Flexible deadlines", format: (value) => (value ? "Yes" : "No") },
  { key: "shift_scale", label: "Shift scale", format: (value) => `${Math.round(Number(value) * 100)}%` },
];

export function OptimizerView({ simulationId }: { simulationId: string }) {
  const [data, setData] = useState<ParetoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(48);
  const [seed, setSeed] = useState(42);
  const [filter, setFilter] = useState<"frontier" | "all">("frontier");
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<SimulationSummary | null>(null);
  const [needsRun, setNeedsRun] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ policyName: string; simulationId: string | null } | null>(
    null,
  );

  const populationSize = Number(source?.configuration?.population_size) || 400;

  async function bootstrap() {
    setLoading(true);
    setError(null);
    setNeedsRun(false);
    try {
      const simulation = await api.simulation(simulationId);
      setSource(simulation);
      const runSeed = Number(simulation.random_seed ?? simulation.configuration?.seed ?? 42);
      setSeed(Number.isFinite(runSeed) ? runSeed : 42);

      try {
        const stored = await api.pareto(simulationId);
        setData(stored);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // No stored frontier: wait for an explicit run instead of blocking
          // the page for several seconds on open.
          setNeedsRun(true);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the policy optimizer.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationId]);

  useEffect(() => {
    if (!data) return;
    const reference = data.candidates.find((candidate) => candidate.strategy === "reference");
    const first = data.frontier.find((candidate) => candidate.strategy !== "reference");
    setSelected((current) => {
      if (current.length > 0) return current;
      return [reference?.id, first?.id].filter((value): value is string => Boolean(value));
    });
  }, [data]);

  const reference = data?.candidates.find((candidate) => candidate.strategy === "reference") ?? null;
  const frontier = data?.frontier ?? [];

  const rows = useMemo(() => {
    if (!data) return [];
    const source = filter === "frontier" ? data.frontier : data.candidates;
    return [...source].sort((a, b) => Number(b.on_frontier) - Number(a.on_frontier) || a.exposure - b.exposure);
  }, [data, filter]);

  const chartPoints = useMemo(
    () => ({
      dominated: (data?.candidates ?? []).filter((candidate) => !candidate.on_frontier),
      frontier: (data?.candidates ?? []).filter((candidate) => candidate.on_frontier && candidate.strategy !== "reference"),
      reference: (data?.candidates ?? []).filter((candidate) => candidate.strategy === "reference"),
    }),
    [data],
  );

  const selectedCandidates = useMemo(
    () =>
      selected
        .map((id) => data?.candidates.find((candidate) => candidate.id === id))
        .filter((value): value is Candidate => Boolean(value)),
    [selected, data],
  );

  async function regenerate() {
    setRunning(true);
    setError(null);
    try {
      const result = await api.optimize(simulationId, { candidate_count: count, seed });
      setData(result);
      setNeedsRun(false);
      setSelected([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Optimization failed. Existing candidates were kept.");
    } finally {
      setRunning(false);
    }
  }

  async function applyAsPolicy(candidate: Candidate) {
    setApplying(candidate.id);
    setError(null);
    setApplied(null);
    try {
      const response = await api.applyCandidate(simulationId, {
        candidate_id: candidate.id,
        run_simulation: true,
        population_size: populationSize,
      });
      setApplied({
        policyName: response.policy.name,
        simulationId: response.simulation?.id ?? null,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not apply this candidate as a policy.",
      );
    } finally {
      setApplying(null);
    }
  }

  function toggleCandidate(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) return [...current.slice(1), id];
      return [...current, id];
    });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-16 w-2/3 animate-pulse rounded-xl bg-white" />
        <div className="card flex items-start gap-4 p-6">
          <Loader2 className="mt-1 h-5 w-5 animate-spin text-teal-700" />
          <div>
            <p className="text-[13px] font-semibold text-navy-950">Preparing the policy optimizer</p>
            <p className="mt-1 max-w-xl text-[11.5px] leading-5 text-ink-muted">
              Loading the stored simulation or evaluating policy candidates against its weather snapshot
              and synthetic population. Candidate evaluation runs server-side; results appear when it
              completes.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[110px] animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="h-[400px] animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  if (needsRun && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Policy optimizer · Pareto analysis"
          title="Run the optimisation for this simulation"
          description="Candidate evaluation runs server-side against this simulation's stored weather snapshot, population and engine settings. Nothing runs until you ask for it."
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link href={`/results/${simulationId}`}>
                <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Results
              </Link>
            </Button>
          }
        />

        <section className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">NO STORED FRONTIER</Badge>
            <Badge tone="neutral">{populationSize} WORKERS</Badge>
            <Badge tone="neutral">{count} CANDIDATES</Badge>
            <Badge tone="neutral">SEED {seed}</Badge>
          </div>
          <h2 className="mt-3 text-[15px] font-semibold text-navy-950">
            This run has no optimisation stored yet
          </h2>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-ink-soft">
            The search evaluates {count} policy variants against {populationSize} workers and the
            same weather snapshot. It usually takes a few seconds; the page stays usable while it
            runs and any existing run-level results are untouched.
          </p>

          <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
            <label className="text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted">
              Candidates
              <Select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="mt-1 h-9 text-[12px]"
              >
                {CANDIDATE_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value} candidates
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted">
              Seed
              <input
                type="number"
                min={0}
                max={4_294_967_295}
                value={seed}
                onChange={(event) => setSeed(Number(event.target.value))}
                className="focus-ring mt-1 h-9 w-full rounded-xl border border-line bg-white px-2.5 font-mono text-[12px]"
              />
            </label>
          </div>

          <Button
            variant="navy"
            size="sm"
            className="mt-3"
            onClick={() => void regenerate()}
            disabled={running}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {running ? "Evaluating candidates…" : "Run optimisation"}
          </Button>

          {running ? (
            <div className="mt-3 max-w-md">
              <div className="h-1 overflow-hidden rounded-full bg-mist-200">
                <div className="h-full w-1/3 animate-progress rounded-full bg-teal-500" />
              </div>
              <p className="mt-1.5 text-[9.5px] text-ink-muted">
                Server-side evaluation in progress. No synthetic percentage is shown.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-heat-600" />
        <h1 className="mt-3 text-[18px] font-semibold text-navy-950">Optimizer unavailable</h1>
        <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">{error}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void bootstrap()}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
          <Button asChild size="sm" variant="navy">
            <Link href={`/results/${simulationId}`}>Back to results</Link>
          </Button>
        </div>
      </div>
    );
  }

  const bestExposure = frontier.length ? Math.min(...frontier.map((candidate) => candidate.objectives.exposure)) : null;
  const bestIncome = frontier.length ? Math.min(...frontier.map((candidate) => candidate.objectives.income_loss)) : null;
  const bestDisruption = frontier.length ? Math.min(...frontier.map((candidate) => candidate.objectives.disruption)) : null;
  const budget = data.constraints?.budget_limit;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Policy optimizer · Pareto analysis"
        title="Compare real policy trade-offs"
        description="Every candidate is evaluated with the same stored weather snapshot, synthetic workers and engine assumptions as the source simulation. Non-dominated candidates form a genuine Pareto frontier — not a single recommended answer."
        actions={
          <>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/results/${simulationId}`}>
                <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Results
              </Link>
            </Button>
            <Button asChild size="sm" variant="navy">
              <a href={api.reportUrl(simulationId)} target="_blank" rel="noreferrer">
                PDF report
              </a>
            </Button>
          </>
        }
      />

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal" className="gap-1.5">
          <CircleDot className="h-3 w-3" /> REAL FRONTIER
        </Badge>
        <Badge tone="navy">{data.evaluated} CANDIDATES EVALUATED</Badge>
        <Badge tone="amber">{frontier.length} NON-DOMINATED</Badge>
        <span className="text-[10.5px] text-ink-muted">
          seed {data.seed} · feasible {data.feasible}
        </span>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OptimizerStat
          icon={<Target className="h-4 w-4" />}
          label="Pareto frontier"
          value={`${frontier.length}`}
          hint={`of ${data.evaluated} evaluated candidates`}
          tone="teal"
        />
        <OptimizerStat
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="Feasible candidates"
          value={`${data.feasible}`}
          hint={`${data.evaluated - data.feasible} violated a constraint`}
          tone="navy"
        />
        <OptimizerStat
          icon={<Scale className="h-4 w-4" />}
          label="Lowest exposure on frontier"
          value={bestExposure === null ? "—" : formatNumber(bestExposure, 1)}
          hint="index /100; lower is better"
          tone="heat"
        />
        <OptimizerStat
          icon={<Wallet className="h-4 w-4" />}
          label="Lowest income loss on frontier"
          value={bestIncome === null ? "—" : formatNumber(bestIncome, 2)}
          hint={
            bestDisruption === null
              ? "per worker-shift"
              : `min disruption ${formatNumber(bestDisruption, 1)}%`
          }
          tone="navy"
        />
      </section>

      {/* Scatter */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Exposure vs. income loss</h2>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-5 text-ink-muted">
              Each point is an evaluated policy. Bubble size reflects operational disruption. The
              lower-left direction is better on both axes. Teal points are Pareto-optimal; grey points
              are dominated by another candidate; amber is the existing policy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="teal">PARETO</Badge>
            <Badge tone="neutral">DOMINATED</Badge>
            <Badge tone="amber">REFERENCE</Badge>
          </div>
        </div>

        <div className="mt-3 h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 18, bottom: 18, left: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number"
                dataKey="income_loss"
                name="Income loss / worker-shift"
                {...axisProps}
                domain={["auto", "auto"]}
                tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
                label={{
                  value: "Estimated income loss per worker-shift ($) → worse",
                  position: "insideBottom",
                  offset: -12,
                  fill: CHART.axis,
                  fontSize: 9.5,
                }}
              />
              <YAxis
                type="number"
                dataKey="exposure"
                name="Exposure index"
                {...axisProps}
                domain={["auto", "auto"]}
                width={44}
                label={{
                  value: "Exposure index → worse",
                  angle: -90,
                  position: "insideLeft",
                  fill: CHART.axis,
                  fontSize: 9.5,
                }}
              />
              <ZAxis type="number" dataKey="disruption" range={[55, 190]} />
              <Tooltip content={<ParetoTooltip />} />
              <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 10, color: CHART.axis }} />
              <Scatter name="Dominated" data={chartPoints.dominated} fill="#CBD5E1" fillOpacity={0.65}>
                {chartPoints.dominated.map((candidate) => (
                  <Cell key={candidate.id} fill="#CBD5E1" />
                ))}
              </Scatter>
              <Scatter name="Pareto frontier" data={chartPoints.frontier} fill={CHART.teal}>
                {chartPoints.frontier.map((candidate) => (
                  <Cell key={candidate.id} fill={CHART.teal} />
                ))}
              </Scatter>
              <Scatter name="Existing policy" data={chartPoints.reference} fill={CHART.amber}>
                {chartPoints.reference.map((candidate) => (
                  <Cell key={candidate.id} fill={CHART.amber} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[9.5px] leading-4 text-ink-muted">
          Axes are raw objective values, not normalised scores. A candidate is Pareto-optimal only when
          no other evaluated candidate is at least as good on all three objectives and strictly better on
          one. Adding more candidates can change the frontier.
        </p>
      </section>

      {/* Trade-off narratives */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-navy-950">Plain-language trade-offs</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Changes are relative to the existing policy on the same run. Estimates, not guarantees.
            </p>
          </div>
          <Badge tone="navy">NO SINGLE BEST POLICY</Badge>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {frontier
            .filter((candidate) => candidate.strategy !== "reference")
            .slice(0, 3)
            .map((candidate) => (
              <TradeoffCard key={candidate.id} candidate={candidate} reference={reference} />
            ))}
          {frontier.filter((candidate) => candidate.strategy !== "reference").length === 0 ? (
            <div className="card col-span-full p-6 text-center text-[11.5px] text-ink-muted">
              This frontier contains only the reference policy. Try a larger candidate search.
            </div>
          ) : null}
        </div>
      </section>

      {/* Candidate table */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Candidate comparison</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Select up to three candidates to compare configurations side by side.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-line bg-mist-50 p-0.5">
              {(["frontier", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10.5px] font-medium capitalize transition-colors",
                    filter === value ? "bg-white text-navy-900 shadow-sm" : "text-ink-muted hover:text-navy-900",
                  )}
                >
                  {value === "frontier" ? "Frontier only" : `All (${data.evaluated})`}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-ink-muted">{selected.length}/3 selected</span>
          </div>
        </div>

        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[860px] text-left text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-mist-50">
              <tr className="border-b border-line text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">
                <th className="px-4 py-2.5 font-semibold">Compare</th>
                <th className="px-3 py-2.5 font-semibold">Candidate</th>
                <th className="px-3 py-2.5 font-semibold">Exposure</th>
                <th className="px-3 py-2.5 font-semibold">Income loss</th>
                <th className="px-3 py-2.5 font-semibold">Disruption</th>
                <th className="px-3 py-2.5 font-semibold">Break access</th>
                <th className="px-3 py-2.5 font-semibold">Cost / shift</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((candidate) => {
                const active = selected.includes(candidate.id);
                return (
                  <tr
                    key={candidate.id}
                    className={cn(
                      "border-b border-line/70 transition-colors last:border-0",
                      active ? "bg-teal-50/50" : "hover:bg-mist-100/60",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleCandidate(candidate.id)}
                        className="h-3.5 w-3.5 rounded border-line accent-teal-600"
                        aria-label={`Compare ${candidate.label}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-navy-900">{candidate.label}</p>
                      <p className="mt-0.5 text-[9.5px] text-ink-muted">{candidate.strategy}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-heat-700">{formatNumber(candidate.objectives.exposure, 1)}</td>
                    <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(candidate.objectives.income_loss, 2)}</td>
                    <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(candidate.objectives.disruption, 1)}%</td>
                    <td className="px-3 py-2.5 font-mono text-ink-soft">
                      {formatPercent(candidate.supporting_metrics.break_accessibility, 1)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-ink-soft">
                      ${formatNumber(candidate.supporting_metrics.cost_per_worker_shift, 2)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {candidate.strategy === "reference" ? <Badge tone="amber">Reference</Badge> : null}
                        {candidate.on_frontier && candidate.strategy !== "reference" ? <Badge tone="teal">Pareto</Badge> : null}
                        {!candidate.feasible ? <Badge tone="rose">Infeasible</Badge> : null}
                        {candidate.recommended ? <Badge tone="navy">Balanced</Badge> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line bg-mist-50 px-5 py-2.5 text-[9.5px] leading-4 text-ink-muted">
          Income loss and disruption are per-worker-shift estimates. Cost reflects modelled break
          compensation and backfill, not a procurement quote.
          {typeof budget === "number" ? ` Candidate constraint: $${formatNumber(budget, 0)} per worker-shift.` : ""}
        </p>
      </section>

      {/* Selected side-by-side */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Side-by-side configuration</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Up to three policies. The reference column is the policy used by the source simulation.
            </p>
          </div>
          <Badge tone="neutral">{selectedCandidates.length} selected</Badge>
        </div>
        {selectedCandidates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line bg-mist-50 text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">
                  <th className="px-5 py-2.5 font-semibold">Parameter</th>
                  {selectedCandidates.map((candidate) => (
                    <th key={candidate.id} className="px-3 py-2.5 font-semibold">
                      {candidate.label}
                      <span className="mt-0.5 block font-normal normal-case tracking-normal text-ink-muted">
                        {candidate.strategy}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PARAMS.map((param) => (
                  <tr key={param.key} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-2.5 text-ink-muted">{param.label}</td>
                    {selectedCandidates.map((candidate) => (
                      <td key={candidate.id} className="px-3 py-2.5 font-mono text-navy-900">
                        {param.format(candidate.policy[param.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line bg-mist-50">
                  <td className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-muted">Outcomes</td>
                  {selectedCandidates.map((candidate) => (
                    <td key={candidate.id} className="px-3 py-3 text-[10px] leading-4 text-ink-muted">
                      <p>Exposure {formatNumber(candidate.objectives.exposure, 1)}</p>
                      <p>Income loss ${formatNumber(candidate.objectives.income_loss, 2)}</p>
                      <p>Disruption {formatNumber(candidate.objectives.disruption, 1)}%</p>
                      <p>Retention {formatPercent(candidate.supporting_metrics.income_retention, 1)}</p>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-[11.5px] text-ink-muted">
            Select candidates in the table above to compare their full configurations.
          </div>
        )}
        {selectedCandidates.some((candidate) => candidate.strategy !== "reference") ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-mist-50 px-5 py-3">
            <p className="mr-1 text-[10.5px] text-ink-muted">
              Applying creates a new policy and re-runs this scenario with the same seed and
              population ({populationSize} workers):
            </p>
            {selectedCandidates
              .filter((candidate) => candidate.strategy !== "reference")
              .map((candidate) => (
                <Button
                  key={candidate.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => void applyAsPolicy(candidate)}
                  disabled={applying !== null}
                >
                  {applying === candidate.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Apply “{candidate.label}”
                </Button>
              ))}
          </div>
        ) : null}
        {applied ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-teal-200 bg-teal-50/70 px-5 py-3">
            <div>
              <p className="text-[11.5px] font-semibold text-teal-900">
                Applied as policy: {applied.policyName}
              </p>
              <p className="mt-0.5 text-[10.5px] text-teal-800/80">
                {applied.simulationId
                  ? "A new simulation was run with this policy."
                  : "The policy was saved without running a simulation."}
              </p>
            </div>
            {applied.simulationId ? (
              <Button asChild size="sm" variant="navy">
                <Link href={`/results/${applied.simulationId}`}>
                  Open the new results <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="secondary">
                <Link href="/policies">Open policies</Link>
              </Button>
            )}
          </div>
        ) : null}
      </section>

      {/* Re-run + methodology */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-teal-700" />
            <h2 className="text-[13.5px] font-semibold text-navy-950">Re-run the search</h2>
          </div>
          <p className="mt-1 text-[10.5px] leading-4 text-ink-muted">
            Candidate evaluation is deterministic for a fixed seed. Re-running replaces the stored
            candidates for this simulation and can change the frontier.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted">
              Candidates
              <Select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="mt-1 h-9 text-[12px]"
              >
                {CANDIDATE_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value} candidates
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted">
              Seed
              <input
                type="number"
                min={0}
                max={4_294_967_295}
                value={seed}
                onChange={(event) => setSeed(Number(event.target.value))}
                className="focus-ring mt-1 h-9 w-full rounded-xl border border-line bg-white px-2.5 font-mono text-[12px]"
              />
            </label>
          </div>
          <Button variant="navy" size="sm" className="mt-3 w-full" onClick={regenerate} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {running ? "Evaluating candidates…" : "Re-run optimization"}
          </Button>
          {running ? (
            <div className="mt-3">
              <div className="h-1 overflow-hidden rounded-full bg-mist-200">
                <div className="h-full w-1/3 animate-progress rounded-full bg-teal-500" />
              </div>
              <p className="mt-1.5 text-[9.5px] text-ink-muted">
                Server-side evaluation in progress. No synthetic percentage is shown.
              </p>
            </div>
          ) : null}
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-teal-700" />
            <h2 className="text-[13.5px] font-semibold text-navy-950">How the frontier is produced</h2>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["Candidate generation", "Structured variants change protected break duration, break compensation, deadline flexibility, bonus dependency, penalty severity and operational constraints around the existing policy."],
              ["Shared conditions", "Every candidate is evaluated with the exact same stored weather snapshot, synthetic worker population and engine coefficients as this simulation."],
              ["Three objectives", "Minimise estimated heat exposure, minimise estimated income loss, and minimise operational disruption. Feasibility constraints are recorded separately."],
              ["Real non-dominance", "A candidate is Pareto-optimal only if no evaluated candidate is at least as good on all objectives and strictly better on one. The frontier is recomputed from returned evaluations."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-line bg-mist-50 p-3">
                <p className="text-[11px] font-semibold text-navy-900">{title}</p>
                <p className="mt-1 text-[10px] leading-4 text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg border border-heat-200 bg-heat-50 px-3 py-2 text-[9.5px] leading-4 text-heat-800">
            The frontier describes modelled trade-offs and is not evidence of policy effectiveness in a real
            workplace. Coefficients are illustrative and require validation and worker consultation.
          </p>
        </section>
      </div>

      {data.notes?.length ? (
        <section className="card p-5">
          <p className="label-caps">Optimizer notes</p>
          <ul className="mt-2 space-y-1.5">
            {data.notes.map((note) => (
              <li key={note} className="flex items-start gap-2 text-[10.5px] leading-4 text-ink-muted">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
                {note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ParetoTooltip({ active, payload }: { active?: boolean; payload?: { payload: Candidate }[] }) {
  if (!active || !payload?.length) return null;
  const candidate = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-white p-3 shadow-lift">
      <p className="text-[11px] font-semibold text-navy-950">{candidate.label}</p>
      <p className="mt-0.5 text-[9.5px] text-ink-muted">{candidate.strategy}</p>
      <div className="mt-2 space-y-0.5 text-[10px]">
        <p className="flex justify-between gap-6">
          <span className="text-ink-muted">Exposure</span>
          <span className="font-mono font-semibold text-heat-700">{formatNumber(candidate.objectives.exposure, 1)}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-ink-muted">Income loss</span>
          <span className="font-mono font-semibold text-navy-900">${formatNumber(candidate.objectives.income_loss, 2)}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-ink-muted">Disruption</span>
          <span className="font-mono font-semibold text-navy-900">{formatNumber(candidate.objectives.disruption, 1)}%</span>
        </p>
      </div>
      <p className="mt-1.5 text-[9px] font-medium text-teal-700">
        {candidate.on_frontier ? "Pareto-optimal" : "Dominated"}
        {candidate.feasible ? "" : " · infeasible"}
      </p>
    </div>
  );
}

function TradeoffCard({ candidate, reference }: { candidate: Candidate; reference: Candidate | null }) {
  if (!reference) return null;
  const exposure = reference.objectives.exposure - candidate.objectives.exposure;
  const income = reference.objectives.income_loss - candidate.objectives.income_loss;
  const disruption = reference.objectives.disruption - candidate.objectives.disruption;
  const better = (value: number) => value > 0;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-navy-950">{candidate.label}</p>
          <p className="mt-0.5 text-[9.5px] text-ink-muted">{candidate.strategy}</p>
        </div>
        {candidate.recommended ? <Badge tone="navy">Balanced</Badge> : <Badge tone="teal">Pareto</Badge>}
      </div>
      <div className="mt-3 space-y-1.5 text-[10px]">
        <DeltaRow label="Exposure" value={exposure} unit=" points" inverse />
        <DeltaRow label="Income loss" value={income} unit="$" inverse />
        <DeltaRow label="Disruption" value={disruption} unit=" pp" inverse />
      </div>
      <p className="mt-2.5 border-t border-line pt-2 text-[9.5px] leading-4 text-ink-muted">
        {better(exposure) && better(income) && better(disruption)
          ? "Improves all three modelled objectives relative to the existing policy."
          : better(exposure) && better(income)
            ? `Lower exposure and income loss, but ${formatNumber(Math.abs(disruption), 1)} pp ${disruption >= 0 ? "less" : "more"} disruption.`
            : better(exposure)
              ? `Lower exposure, but income loss is ${formatNumber(Math.abs(income), 2)} ${income >= 0 ? "lower" : "higher"} per worker-shift.`
              : "Reduces another objective at the cost of exposure relative to the reference."}
        {" "}Break access {formatPercent(candidate.supporting_metrics.break_accessibility, 0)} · cost $
        {formatNumber(candidate.supporting_metrics.cost_per_worker_shift, 2)}/shift.
      </p>
    </div>
  );
}

function DeltaRow({ label, value, unit, inverse }: { label: string; value: number; unit: string; inverse?: boolean }) {
  const positive = inverse ? value > 0 : value < 0;
  const neutral = Math.abs(value) < 0.005;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <span
        className={cn(
          "font-mono font-semibold",
          neutral ? "text-ink-muted" : positive ? "text-teal-700" : "text-heat-700",
        )}
      >
        {value > 0 ? "−" : value < 0 ? "+" : ""}
        {formatNumber(Math.abs(value), 2)}
        {unit}
      </span>
    </div>
  );
}

function OptimizerStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "teal" | "navy" | "heat";
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] font-medium leading-tight text-ink-muted">{label}</p>
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-lg",
            tone === "teal" ? "bg-teal-50 text-teal-700" : tone === "heat" ? "bg-heat-50 text-heat-700" : "bg-mist-100 text-navy-700",
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 font-display text-[25px] font-bold tracking-tight",
          tone === "teal" ? "text-teal-800" : tone === "heat" ? "text-heat-700" : "text-navy-950",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[9.5px] leading-4 text-ink-muted">{hint}</p>
    </div>
  );
}
