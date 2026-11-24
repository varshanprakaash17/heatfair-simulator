"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CloudSun,
  Download,
  FileText,
  Flame,
  GitBranch,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { SimulationListRow, SimulationResults } from "@/lib/types";
import { formatDate, formatDuration, formatNumber, formatPercent } from "@/lib/utils";
import { CHART, axisProps, gridProps, tooltipStyle } from "@/components/charts/theme";

export function ResultsView({ simulationId }: { simulationId: string }) {
  const { bootstrap } = useWorkspace();
  const [data, setData] = useState<SimulationResults | null>(null);
  const [history, setHistory] = useState<SimulationListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.results(simulationId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load these simulation results.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationId]);

  useEffect(() => {
    if (!bootstrap?.organization.id) return;
    api
      .simulations(bootstrap.organization.id, 10)
      .then((rows) => setHistory(rows.filter((row) => row.id !== simulationId && row.status === "completed")))
      .catch(() => setHistory([]));
  }, [bootstrap?.organization.id, simulationId]);

  const metrics = data?.metrics;
  const weather = data?.weather;
  const scenario = data?.scenario as Record<string, any> | null;
  const policy = data?.policy as Record<string, any> | null;
  const config = data?.assumptions?.configuration as Record<string, any> | undefined;
  const workers = metrics?.population?.workers ?? config?.population_size;
  const breakdown = config?.population_breakdown as
    | { synthetic: number; saved: number; total: number }
    | undefined;
  const locationName = weather?.location?.name ?? scenario?.location?.name ?? "Stored scenario";
  const latitude = weather?.latitude ?? weather?.location?.latitude ?? scenario?.location?.latitude;
  const longitude = weather?.longitude ?? weather?.location?.longitude ?? scenario?.location?.longitude;
  const shiftStart = weather?.shift?.start_hour ?? config?.work_start_hour;
  const shiftEnd = weather?.shift?.end_hour ?? config?.work_end_hour;
  const forecastDate = weather?.forecast_date ?? weather?.shift?.date;

  const occupationRows = useMemo(
    () =>
      Object.entries(data?.by_occupation ?? {}).map(([name, value]) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        ...value,
      })),
    [data?.by_occupation],
  );

  const hourlyData = useMemo(
    () =>
      (data?.hourly ?? []).map((point) => ({
        hour: point.label,
        heat: point.heat_index,
        excess: point.excess_heat,
        contribution: point.contribution,
      })),
    [data?.hourly],
  );

  const exposureDistribution = useMemo(
    () =>
      (metrics?.exposure_distribution.labels ?? []).map((label, index) => ({
        bin: label,
        workers: metrics?.exposure_distribution.counts[index] ?? 0,
      })),
    [metrics?.exposure_distribution],
  );

  const incomeDistribution = useMemo(
    () =>
      (metrics?.income_retention_distribution.labels ?? []).map((label, index) => ({
        bin: label,
        workers: metrics?.income_retention_distribution.counts[index] ?? 0,
      })),
    [metrics?.income_retention_distribution],
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-16 w-2/3 animate-pulse rounded-xl bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[124px] animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="h-[340px] animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  if (error || !data || !metrics) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-heat-600" />
        <h1 className="mt-3 text-[18px] font-semibold text-navy-950">Results unavailable</h1>
        <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
          {error ?? "This simulation has no stored result payload."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
          <Button asChild size="sm" variant="navy">
            <Link href="/simulate">Run a simulation</Link>
          </Button>
        </div>
      </div>
    );
  }

  const label = String(config?.label ?? (scenario?.name as string) ?? "Simulation");
  const previous = history.slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Simulation results"
        title={label}
        description={`${data.model_version} · ${workers ? `${Number(workers).toLocaleString()} workers` : "population stored"}${
          breakdown?.saved
            ? ` (${breakdown.synthetic.toLocaleString()} synthetic + ${breakdown.saved.toLocaleString()} saved)`
            : ""
        } · seed ${String(
          data.reproducibility?.random_seed ?? config?.random_seed ?? "—",
        )} · completed ${formatDate(data.created_at)}`}
        actions={
          <>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/optimizer/${simulationId}`}>
                <GitBranch className="h-3.5 w-3.5" /> Optimize policies
              </Link>
            </Button>
            <Button asChild size="sm" variant="navy">
              <a href={api.reportUrl(simulationId)} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" /> PDF report
              </a>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal" className="gap-1.5">
          <CheckCircle2 className="h-3 w-3" /> COMPLETED
        </Badge>
        <Badge tone="navy">MODEL {data.model_version}</Badge>
        <Badge tone="amber">
          <CloudSun className="mr-1 h-3 w-3" /> {weather ? "LIVE WEATHER SNAPSHOT" : "STORED SCENARIO"}
        </Badge>
        <span className="text-[10.5px] text-ink-muted">
          duration {data.duration_ms != null ? formatDuration(data.duration_ms) : "—"} ·
          run {simulationId.slice(0, 8)}
        </span>
      </div>

      {/* Summary metrics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Heat exposure index"
          value={formatNumber(metrics.exposure_index, 1)}
          unit="/100"
          delta={metrics.delta_vs_baseline?.exposure_index}
          deltaTone="good"
          hint="vs. no-protection baseline · lower is better"
          icon={<Flame className="h-4 w-4" />}
          accent="heat"
          series={hourlyData.map((point) => point.heat)}
        />
        <StatCard
          label="Incentive pressure index"
          value={formatNumber(metrics.incentive_pressure_index, 1)}
          unit="/100"
          hint="published policy-level weighted index"
          icon={<Activity className="h-4 w-4" />}
          accent="navy"
        />
        <StatCard
          label="Break accessibility"
          value={formatPercent(metrics.break_accessibility, 1)}
          delta={metrics.delta_vs_baseline?.break_accessibility}
          deltaTone="good"
          hint="hypothetical logistic estimate"
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="teal"
        />
        <StatCard
          label="Income retention"
          value={formatPercent(metrics.income_retention, 1)}
          delta={metrics.delta_vs_baseline?.income_retention}
          deltaTone="good"
          hint="estimated vs. baseline earnings"
          icon={<Wallet className="h-4 w-4" />}
          accent="navy"
        />
        <StatCard
          label="Income loss"
          value={formatNumber(metrics.total_daily_income_loss, 0)}
          unit="total"
          hint={`${formatNumber(metrics.income_loss_per_worker_shift, 2)} per worker-shift`}
          icon={<Wallet className="h-4 w-4" />}
          accent="heat"
        />
        <StatCard
          label="Operational efficiency"
          value={formatPercent(metrics.operational_efficiency, 1)}
          delta={metrics.delta_vs_baseline?.operational_efficiency}
          deltaTone="neutral"
          hint="coverage-adjusted estimate"
          icon={<Activity className="h-4 w-4" />}
          accent="teal"
        />
      </section>

      {/* Provenance and model context */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-caps">Weather provenance</p>
              <h2 className="mt-1.5 flex items-center gap-1.5 text-[15px] font-semibold text-navy-950">
                <MapPin className="h-4 w-4 text-teal-700" /> {locationName}
              </h2>
              <p className="mt-0.5 text-[10.5px] text-ink-muted">
                {typeof latitude === "number" && typeof longitude === "number"
                  ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                  : "Coordinates unavailable"}
                {weather?.location.timezone ? ` · ${weather.location.timezone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={weather ? "teal" : "neutral"}>{weather ? "LIVE RETRIEVAL" : "SCENARIO"}</Badge>
              <Badge tone="amber">{(weather?.weather_type ?? "forecast").toUpperCase()}</Badge>
            </div>
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[11px] sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Data source</dt>
              <dd className="text-right font-medium text-ink-soft">{weather?.provider ?? scenario?.source ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Snapshot ID</dt>
              <dd className="text-right font-mono text-[10px] text-ink-soft">
                {weather?.snapshot_id ? weather.snapshot_id.slice(0, 13) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Retrieved by HeatFair</dt>
              <dd className="text-right font-medium text-ink-soft">{formatDate(weather?.retrieved_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Provider timestamp</dt>
              <dd className="text-right font-medium text-ink-soft">{weather?.source_timestamp ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Forecast date</dt>
              <dd className="text-right font-medium text-ink-soft">{forecastDate ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Shift window</dt>
              <dd className="text-right font-medium text-ink-soft">
                {typeof shiftStart === "number" && typeof shiftEnd === "number"
                  ? `${String(shiftStart).padStart(2, "0")}:00–${String(shiftEnd).padStart(2, "0")}:00`
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-3 rounded-lg border border-line bg-mist-50 px-3 py-2.5 text-[10.5px] leading-4 text-ink-muted">
            <span className="font-semibold text-ink-soft">What this is: </span>
            {weather?.data_note ??
              "This run used a stored synthetic scenario rather than a live weather snapshot. Values are illustrative."}
            <span className="mt-1 block">
              Modelled forecast values are not on-site sensor measurements, and future hours are not
              observed conditions.
            </span>
          </div>
          {weather?.missing_variables?.length ? (
            <p className="mt-2 text-[10px] text-heat-700">
              Missing from provider response: {weather.missing_variables.join(", ")}. The engine handles
              missing values explicitly.
            </p>
          ) : null}
        </section>

        <section className="card p-5">
          <p className="label-caps">Policy &amp; population</p>
          <h2 className="mt-1.5 truncate text-[15px] font-semibold text-navy-950">
            {String(policy?.name ?? config?.policy_name ?? "Policy configuration")}
          </h2>
          <p className="mt-0.5 text-[10.5px] text-ink-muted">
            {workers ? `${Number(workers).toLocaleString()} workers` : "Population"}
            {breakdown?.saved
              ? ` · ${breakdown.synthetic.toLocaleString()} synthetic + ${breakdown.saved.toLocaleString()} saved`
              : ""}{" "}
            · {formatNumber(metrics.incentive_pressure_index, 1)}/100 pressure
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10.5px]">
            <Fact label="Deadline pressure" value={pct(policy?.deadline_pressure)} />
            <Fact label="Bonus dependency" value={pct(policy?.bonus_dependency)} />
            <Fact label="Penalty severity" value={pct(policy?.penalty_severity)} />
            <Fact label="Break protection" value={pct(policy?.break_compensation)} />
            <Fact label="Protected break" value={`${policy?.protected_break_minutes ?? "—"} min`} />
            <Fact label="Max shift" value={`${policy?.max_shift_hours ?? "—"} h`} />
            <Fact label="Paid breaks" value={policy?.paid_breaks ? "Yes" : "No"} />
            <Fact label="Flexible deadlines" value={policy?.flexible_deadlines ? "Yes" : "No"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <Button asChild variant="secondary" size="sm">
              <Link href="/policies">Edit policy</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/optimizer/${simulationId}`}>
                Compare alternatives <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </section>
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ChartPanel
          title="Hourly heat indicator"
          subtitle="Modelled heat indicator for each shift hour. The exposure index integrates hours above the reference."
          badge="CALCULATED"
        >
          <div className="h-[250px]">
            {hourlyData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="resHeat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.heat} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={CHART.heat} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="hour" {...axisProps} interval="preserveStartEnd" />
                  <YAxis {...axisProps} width={40} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number, name: string) => [
                      formatNumber(value, 2),
                      name === "heat" ? "Heat index" : "Excess above reference",
                    ]}
                  />
                  <Area type="monotone" dataKey="heat" stroke={CHART.heat} strokeWidth={2} fill="url(#resHeat)" />
                  <Line type="monotone" dataKey="excess" stroke={CHART.navy} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartPanel>

        <ChartPanel
          title="Exposure distribution"
          subtitle="Synthetic workers per estimated exposure-index bin."
          badge="MODEL ESTIMATE"
        >
          <div className="h-[250px]">
            {exposureDistribution.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={exposureDistribution} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="bin" {...axisProps} interval={1} tick={{ fill: CHART.axis, fontSize: 8 }} />
                  <YAxis {...axisProps} width={38} />
                  <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value} workers`, "Synthetic workers"]} />
                  <Bar dataKey="workers" fill={CHART.heat} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartPanel
          title="Break accessibility"
          subtitle="Estimated access to protective rest by occupation."
          badge="HYPOTHETICAL"
        >
          <div className="h-[230px]">
            {occupationRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={occupationRows.map((row) => ({ name: row.name, access: row.break_accessibility * 100 }))}
                  margin={{ top: 4, right: 12, bottom: 0, left: 6 }}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis type="number" domain={[0, 100]} {...axisProps} />
                  <YAxis type="category" dataKey="name" width={86} tick={{ fill: CHART.axis, fontSize: 9 }} />
                  <Tooltip {...tooltipStyle} formatter={(value: number) => [`${formatNumber(value, 1)}%`, "Break access"]} />
                  <Bar dataKey="access" fill={CHART.teal} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
          <ChartNote>
            {formatPercent(metrics.workers_with_low_accessibility, 1)} of workers fall below a 50% access
            estimate. Logistic model, not observed behaviour.
          </ChartNote>
        </ChartPanel>

        <ChartPanel
          title="Income impact"
          subtitle="Estimated income retention by occupation, after unpaid rest and incentives."
          badge="MODEL ESTIMATE"
        >
          <div className="h-[230px]">
            {occupationRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={occupationRows.map((row) => ({ name: row.name, retention: row.income_retention }))}
                  margin={{ top: 4, right: 12, bottom: 0, left: 6 }}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis type="number" domain={[0, 100]} {...axisProps} />
                  <YAxis type="category" dataKey="name" width={86} tick={{ fill: CHART.axis, fontSize: 9 }} />
                  <Tooltip {...tooltipStyle} formatter={(value: number) => [`${formatNumber(value, 1)}%`, "Income retention"]} />
                  <Bar dataKey="retention" radius={[0, 4, 4, 0]}>
                    {occupationRows.map((row) => (
                      <Cell key={row.name} fill={row.income_retention >= 90 ? CHART.teal : row.income_retention >= 75 ? CHART.amber : CHART.heat} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
          <ChartNote>
            Total estimated loss {formatNumber(metrics.total_daily_income_loss, 2)} across the
            synthetic population; baseline retention{" "}
            {metrics.baseline ? formatPercent(metrics.baseline.income_retention, 1) : "—"}.
          </ChartNote>
        </ChartPanel>

        <ChartPanel
          title="Operational impact"
          subtitle="Coverage and availability losses vs. estimated efficiency."
          badge="MODEL ESTIMATE"
        >
          <div className="h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Coverage loss", value: (metrics.operational_coverage_loss ?? 0) * 100 },
                  { name: "Availability loss", value: (metrics.operational_availability_loss ?? 0) * 100 },
                  { name: "Disruption", value: metrics.operational_disruption },
                  { name: "Efficiency", value: metrics.operational_efficiency },
                ]}
                margin={{ top: 4, right: 8, bottom: 0, left: -24 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} tick={{ fill: CHART.axis, fontSize: 8.5 }} />
                <YAxis {...axisProps} width={40} domain={[0, 100]} />
                <Tooltip {...tooltipStyle} formatter={(value: number) => [`${formatNumber(value, 1)}%`, "Estimate"]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill={CHART.heat} />
                  <Cell fill={CHART.amber} />
                  <Cell fill={CHART.navy} />
                  <Cell fill={CHART.teal} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartNote>
            Coverage loss reflects protected rest and backfill assumptions; efficiency is not a
            productivity guarantee.
          </ChartNote>
        </ChartPanel>
      </div>

      {/* Income distribution + explanation */}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ChartPanel
          title="Income retention distribution"
          subtitle="Synthetic workers per retention band, under this policy."
          badge="MODEL ESTIMATE"
        >
          <div className="h-[210px]">
            {incomeDistribution.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeDistribution} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="bin" {...axisProps} interval={2} tick={{ fill: CHART.axis, fontSize: 8 }} />
                  <YAxis {...axisProps} width={38} />
                  <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value} workers`, "Synthetic workers"]} />
                  <Bar dataKey="workers" fill={CHART.navy} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartPanel>

        <section className="card p-5">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-teal-700" />
            <h2 className="text-[14px] font-semibold text-navy-950">How to read these metrics</h2>
          </div>
          <div className="mt-3 space-y-3">
            {[
              ["Heat exposure index", "Comparative integral of hourly heat above the reference, weighted by work intensity and duration. Not WBGT, not a medical risk score."],
              ["Incentive pressure", "Published policy-level weighted index of deadlines, bonus dependency, penalty severity and uncompensated breaks."],
              ["Break accessibility", "Hypothetical logistic probability-like estimate that a protected break can be taken. Not observed behaviour."],
              ["Income retention / loss", "Estimated take-home pay relative to a no-policy-change baseline, including unpaid rest and incentive assumptions."],
              ["Operational efficiency", "Coverage- and availability-adjusted estimate, driven by protected rest, workload and deadline flexibility."],
            ].map(([title, body]) => (
              <div key={title} className="border-b border-line/70 pb-2.5 last:border-0 last:pb-0">
                <p className="text-[11.5px] font-semibold text-navy-900">{title}</p>
                <p className="mt-0.5 text-[10.5px] leading-4 text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Occupation breakdown */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">By occupation</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Population composition and per-group estimates. Generated profiles are synthetic; saved
              profiles are your own inputs. Real employee records are never used.
            </p>
          </div>
          <Badge tone="amber">SYNTHETIC WORKER DATA</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-line bg-mist-50 text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                <th className="px-5 py-2.5 font-semibold">Occupation</th>
                <th className="px-3 py-2.5 font-semibold">Workers</th>
                <th className="px-3 py-2.5 font-semibold">Exposure</th>
                <th className="px-3 py-2.5 font-semibold">Break access</th>
                <th className="px-3 py-2.5 font-semibold">Income retention</th>
                <th className="px-5 py-2.5 font-semibold">Operational disruption</th>
              </tr>
            </thead>
            <tbody>
              {occupationRows.map((row) => (
                <tr key={row.name} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-900">{row.name}</td>
                  <td className="px-3 py-3 font-mono text-ink-soft">{row.workers}</td>
                  <td className="px-3 py-3 font-mono text-heat-700">{formatNumber(row.exposure_index, 1)}</td>
                  <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(row.break_accessibility, 1)}</td>
                  <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(row.income_retention, 1)}</td>
                  <td className="px-5 py-3 font-mono text-ink-soft">{formatNumber(row.operational_disruption, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recommendations */}
      {data.recommendations?.length ? (
        <section className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">Recommendations for human review</h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Rule-based prompts from the stored metrics. They require safety and worker consultation.
              </p>
            </div>
            <Badge tone="navy">NOT A SAFETY CERTIFICATION</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.recommendations.map((recommendation) => (
              <div key={recommendation.title} className="rounded-xl border border-line bg-mist-50 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11.5px] font-semibold text-navy-900">{recommendation.title}</p>
                  <Badge tone={recommendation.severity === "high" ? "rose" : recommendation.severity === "medium" ? "amber" : "neutral"}>
                    {recommendation.severity}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-4 text-ink-muted">{recommendation.rationale}</p>
                <p className="mt-1.5 text-[10.5px] leading-4 text-teal-800">{recommendation.action}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Comparison */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Compared with previous simulations</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Earlier completed runs from this organization. Different weather or populations make these
              directional, not controlled, comparisons.
            </p>
          </div>
          <Badge tone="neutral">{previous.length} prior</Badge>
        </div>
        {previous.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-mist-50 text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  <th className="px-5 py-2.5 font-semibold">Run</th>
                  <th className="px-3 py-2.5 font-semibold">Workplace</th>
                  <th className="px-3 py-2.5 font-semibold">Workers</th>
                  <th className="px-3 py-2.5 font-semibold">Exposure</th>
                  <th className="px-3 py-2.5 font-semibold">Retention</th>
                  <th className="px-3 py-2.5 font-semibold">Break access</th>
                  <th className="px-5 py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line bg-teal-50/50">
                  <td className="px-5 py-3 font-semibold text-teal-900">This run</td>
                  <td className="px-3 py-3 text-ink-soft">{locationName}</td>
                  <td className="px-3 py-3 font-mono text-ink-soft">{workers ?? "—"}</td>
                  <td className="px-3 py-3 font-mono text-heat-700">{formatNumber(metrics.exposure_index, 1)}</td>
                  <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(metrics.income_retention, 1)}</td>
                  <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(metrics.break_accessibility, 1)}</td>
                  <td className="px-5 py-3 text-[10.5px] text-ink-muted">{formatDate(data.created_at)}</td>
                </tr>
                {previous.slice(0, 3).map((run) => (
                  <tr key={run.id} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/results/${run.id}`} className="font-medium text-navy-900 hover:text-teal-700">
                        {run.label || run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-soft">{run.weather_location ?? run.scenario_name ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{run.population_size ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{formatNumber(run.exposure_index, 1)}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(run.income_retention, 1)}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(run.break_accessibility, 1)}</td>
                    <td className="px-5 py-3 text-[10.5px] text-ink-muted">{formatDate(run.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <BarChart3 className="mx-auto h-5 w-5 text-ink-muted" />
            <p className="mt-2 text-[11.5px] text-ink-muted">No earlier completed simulations yet.</p>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-5">
          <p className="label-caps">Assumptions &amp; limitations</p>
          <ul className="mt-3 space-y-2">
            {(data.limitations?.length
              ? data.limitations
              : [
                  "Synthetic workers are model profiles, not real employee records.",
                  "Weather values are modelled forecasts, not on-site measurements.",
                  "All coefficients are illustrative and have not been empirically validated.",
                  "Outputs are comparative decision support, not a certified safety assessment.",
                ]
            ).slice(0, 8).map((item) => (
              <li key={item} className="flex items-start gap-2 text-[10.5px] leading-4 text-ink-muted">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-heat-500" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-navy-950 p-5 text-white">
          <p className="label-caps text-teal-300">Next step</p>
          <h2 className="mt-2 font-display text-[19px] font-bold leading-snug">
            Compare alternatives on this same snapshot
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-5 text-white/60">
            The optimizer evaluates policy candidates against this run&apos;s weather and worker
            assumptions, then exposes the real Pareto frontier. There is no single universally best policy.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href={`/optimizer/${simulationId}`}>
                <GitBranch className="h-3.5 w-3.5" /> Open optimizer
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white">
              <a href={api.reportUrl(simulationId)} target="_blank" rel="noreferrer">
                <FileText className="h-3.5 w-3.5" /> Report
              </a>
            </Button>
          </div>
        </section>
      </div>

      <p className="pb-2 text-[10px] leading-5 text-ink-muted">
        Simulation ID {simulationId} · model {data.model_version} · report includes provenance,
        assumptions, limitations and candidate comparisons. HeatFair does not diagnose health
        conditions or predict individual injuries, and does not replace professional safety guidance.
      </p>
    </div>
  );
}

function ChartPanel({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[13.5px] font-semibold text-navy-950">{title}</h2>
          <p className="mt-0.5 max-w-md text-[10.5px] leading-4 text-ink-muted">{subtitle}</p>
        </div>
        <Badge tone={badge === "CALCULATED" ? "navy" : badge === "HYPOTHETICAL" ? "teal" : "amber"}>{badge}</Badge>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChartNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 border-t border-line pt-2 text-[9.5px] leading-4 text-ink-muted">{children}</p>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-muted">{label}</p>
      <p className="font-medium text-navy-900">{value}</p>
    </div>
  );
}

function pct(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

function EmptyChart() {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-dashed border-line bg-mist-50">
      <div className="text-center">
        <BarChart3 className="mx-auto h-5 w-5 text-ink-muted" />
        <p className="mt-1.5 text-[10.5px] text-ink-muted">No chart data stored for this run.</p>
      </div>
    </div>
  );
}
