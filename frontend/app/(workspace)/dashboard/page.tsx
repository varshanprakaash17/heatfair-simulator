"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CloudSun,
  Droplets,
  FileText,
  GitBranch,
  Loader2,
  MapPin,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  ThermometerSun,
  UserPlus,
  Users,
  Wallet,
  Wind,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LocationMap } from "@/components/LocationMap";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { DashboardPayload, PopulationBreakdown, WeatherPayload } from "@/lib/types";
import { cn, formatDate, formatNumber, formatPercent } from "@/lib/utils";

// Recharts is loaded after the overview paints, so the first screen is not
// blocked by the chart bundle.
const ExposureTrendChart = dynamic(
  () => import("@/components/dashboard/OverviewCharts").then((module) => module.ExposureTrendChart),
  { ssr: false, loading: () => <ChartLoader /> },
);
const BreakAccessibilityDonut = dynamic(
  () => import("@/components/dashboard/OverviewCharts").then((module) => module.BreakAccessibilityDonut),
  { ssr: false, loading: () => <ChartLoader /> },
);
const IncomeImpactChart = dynamic(
  () => import("@/components/dashboard/OverviewCharts").then((module) => module.IncomeImpactChart),
  { ssr: false, loading: () => <ChartLoader /> },
);

type ActiveLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string | null;
  fromRun: boolean;
};

export default function DashboardPage() {
  const { bootstrap, location, setLocation } = useWorkspace();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [live, setLive] = useState<WeatherPayload | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  async function load(organizationId?: string) {
    setLoading(true);
    setError(null);
    try {
      setData(await api.dashboard(organizationId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }

  // Start the dashboard request immediately: the endpoint falls back to the
  // demo organisation, so the page no longer waits for /demo/bootstrap first.
  useEffect(() => {
    if (bootstrap?.organization.id && data?.organization.id === bootstrap.organization.id) return;
    void load(bootstrap?.organization.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.organization.id]);

  const latest = data?.latest;
  const metrics = latest?.metrics;
  const snapshot = latest?.weather;
  const latestId = latest?.simulation.id;
  const breakdown = latest?.simulation.configuration?.population_breakdown as
    | PopulationBreakdown
    | undefined;
  const savedTotal = data?.counts.saved_workers ?? 0;

  const snapshotLat = snapshot?.location?.latitude;
  const snapshotLon = snapshot?.location?.longitude;
  const activeLocation: ActiveLocation | null = location
    ? {
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
        fromRun: false,
      }
    : typeof snapshotLat === "number" && typeof snapshotLon === "number"
      ? {
          name: snapshot?.location?.name ?? "Last run location",
          latitude: snapshotLat,
          longitude: snapshotLon,
          timezone: snapshot?.location?.timezone ?? null,
          fromRun: true,
        }
      : null;

  const activeLat = activeLocation?.latitude;
  const activeLon = activeLocation?.longitude;
  const activeName = activeLocation?.name;
  const activeTimezone = activeLocation?.timezone;

  const loadLive = useCallback(
    async (force = false) => {
      if (activeLat === undefined || activeLon === undefined) return;
      setLiveLoading(true);
      setLiveError(null);
      try {
        setLive(await api.currentWeather(activeLat, activeLon, activeName, force));
      } catch (err) {
        setLiveError(
          err instanceof ApiError
            ? err.message
            : "Could not load live conditions for this workplace.",
        );
      } finally {
        setLiveLoading(false);
      }
    },
    [activeLat, activeLon, activeName],
  );

  useEffect(() => {
    if (activeLat === undefined || activeLon === undefined) return;
    // Never show the previous workplace's conditions while a new request runs.
    setLive(null);
    void loadLive();
  }, [activeLat, activeLon, activeName, loadLive]);

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([load(bootstrap?.organization.id), loadLive(true)]);
    setRefreshedAt(new Date());
    setRefreshing(false);
  }

  const current = live?.current ?? snapshot?.current;
  const currentIsLive = Boolean(live?.current);
  const retrievedAt = live?.retrieved_at ?? snapshot?.retrieved_at;
  const ageMinutes = minutesSince(retrievedAt);
  const liveFresh = Boolean(live) && ageMinutes !== null && ageMinutes < 15;
  const workplaceName = activeLocation?.name ?? "No workplace selected";
  const lat = activeLat;
  const lon = activeLon;

  const exposureSeries = useMemo(
    () =>
      (latest?.hourly ?? []).map((point) => ({
        hour: point.label,
        heat: point.heat_index,
        contribution: Number((point.contribution ?? 0).toFixed(3)),
      })),
    [latest?.hourly],
  );

  const incomeSeries = useMemo(
    () =>
      (metrics?.income_retention_distribution?.labels ?? []).map((label, index) => ({
        bucket: label,
        workers: metrics?.income_retention_distribution?.counts?.[index] ?? 0,
      })),
    [metrics?.income_retention_distribution],
  );

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Workplace heat & policy overview"
        description={`${data?.organization.name ?? "Organization"} · workforce decision support. Metrics trace to the latest stored simulation; conditions are fetched for the workplace you selected.`}
        actions={
          <>
            <span className="hidden text-[10px] text-ink-muted sm:block">
              {refreshing || liveLoading
                ? "Refreshing conditions…"
                : refreshedAt
                  ? `Refreshed ${refreshedAt.toLocaleTimeString()}`
                  : retrievedAt
                    ? `Conditions from ${formatDate(retrievedAt)}`
                    : ""}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <Button asChild variant="navy" size="sm">
              <Link href="/simulate">
                <Activity className="h-3.5 w-3.5" /> Run simulation
              </Link>
            </Button>
          </>
        }
      />

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => bootstrap && load(bootstrap.organization.id)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {!latest ? (
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50/60 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[13px] font-semibold text-teal-900">No completed simulation yet</p>
            <p className="mt-0.5 text-[11.5px] text-teal-800/80">
              Pick a workplace and run a live-weather simulation. Every card below uses stored
              simulation output rather than invented demo numbers.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/simulate">Run the first simulation</Link>
          </Button>
        </div>
      ) : null}

      {/* Workplace conditions. Live values belong to the selected workplace; the
          snapshot card keeps the last run's inputs visible and separately labelled. */}
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {currentIsLive ? (
                  <Badge tone={liveFresh ? "teal" : "neutral"} className="gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        liveFresh ? "bg-teal-500" : "bg-navy-300",
                      )}
                    />
                    {liveFresh ? "LIVE CONDITIONS" : `CACHED · ${Math.round(ageMinutes ?? 0)} MIN`}
                  </Badge>
                ) : (
                  <Badge tone={current ? "amber" : "neutral"} className="gap-1.5">
                    {current ? "LAST RUN SNAPSHOT" : "NO CONDITIONS YET"}
                  </Badge>
                )}
                <Badge tone="amber">MODELLED FORECAST GRID</Badge>
                {activeLocation?.fromRun ? <Badge tone="neutral">FALLBACK LOCATION</Badge> : null}
              </div>
              <h2 className="mt-2.5 flex items-center gap-1.5 text-[16px] font-semibold text-navy-950">
                <MapPin className="h-4 w-4 shrink-0 text-teal-700" />
                <span className="truncate">{workplaceName}</span>
              </h2>
              <p className="mt-0.5 font-mono text-[10.5px] text-ink-muted">
                {lat !== undefined && lon !== undefined
                  ? `${lat.toFixed(4)}, ${lon.toFixed(4)}`
                  : "Choose a workplace to load conditions"}
                {activeTimezone ? ` · ${activeTimezone}` : ""}
              </p>
              {activeLocation?.fromRun ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-heat-200 bg-heat-50 px-2.5 py-1.5">
                  <p className="text-[10.5px] text-heat-800">
                    No workplace selected, so this is the location of the latest run.
                  </p>
                  <button
                    type="button"
                    className="text-[10.5px] font-semibold text-teal-700 underline-offset-2 hover:underline"
                    onClick={() =>
                      setLocation({
                        name: activeLocation.name,
                        latitude: activeLocation.latitude,
                        longitude: activeLocation.longitude,
                        timezone: activeLocation.timezone,
                      })
                    }
                  >
                    Use this location
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/weather">
                  <CloudSun className="h-3.5 w-3.5" /> Change workplace
                </Link>
              </Button>
            </div>
          </div>

          {liveLoading && !current ? (
            <div className="flex items-center gap-2 px-5 py-10 text-[12px] text-ink-soft">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching current conditions for this
              workplace…
            </div>
          ) : current ? (
            <div className="grid gap-5 px-5 py-5 md:grid-cols-[1.05fr_1.4fr]">
              <div>
                <div className="flex items-end gap-3">
                  <span className="metric text-[46px] font-bold leading-none">
                    {formatNumber(current.temperature, 1)}
                  </span>
                  <span className="pb-1.5 text-[15px] font-medium text-ink-muted">°C</span>
                  <span className="mb-1.5 rounded-full bg-heat-50 px-2 py-0.5 text-[10px] font-medium text-heat-800">
                    feels {formatNumber(current.apparent_temperature, 1)}°
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] font-medium text-navy-900">
                  {current.weather_condition ?? "Condition unavailable"}
                </p>
                <p className="mt-1 text-[10.5px] text-ink-muted">
                  {currentIsLive
                    ? `Provider hour ${current.time ?? "—"} · retrieved ${formatDate(retrievedAt)}`
                    : `Snapshot taken ${formatDate(retrievedAt)} · ${
                        ageMinutes !== null
                          ? `${Math.round(ageMinutes)} min old — not current conditions`
                          : "age unknown"
                      }`}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {[
                    { icon: Droplets, label: "Humidity", value: `${formatNumber(current.humidity, 0)}%` },
                    { icon: Wind, label: "Wind", value: `${formatNumber(current.wind_speed, 1)} km/h` },
                    { icon: Sun, label: "Solar", value: `${formatNumber(current.shortwave_radiation, 0)} W/m²` },
                    { icon: CloudSun, label: "Cloud", value: `${formatNumber(current.cloud_cover, 0)}%` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-line bg-mist-50 px-3 py-2">
                      <p className="flex items-center gap-1 text-[10px] text-ink-muted">
                        <item.icon className="h-3 w-3" /> {item.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] font-semibold text-navy-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-line bg-mist-50 p-3.5">
                <p className="label-caps">
                  {currentIsLive ? "Live request provenance" : "Snapshot provenance"}
                </p>
                <dl className="mt-2 grid gap-1.5 text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Source</dt>
                    <dd className="text-right font-medium text-ink-soft">
                      {(live ?? snapshot)?.provider ?? "Open-Meteo"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Grid cell</dt>
                    <dd className="text-right font-mono font-medium text-ink-soft">
                      {lat !== undefined && lon !== undefined
                        ? `${lat.toFixed(3)}, ${lon.toFixed(3)}`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Retrieved</dt>
                    <dd className="text-right font-medium text-ink-soft">{formatDate(retrievedAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Data designation</dt>
                    <dd className="text-right font-medium text-heat-800">Modelled forecast</dd>
                  </div>
                </dl>
                <div className="mt-3 h-px bg-line" />
                <p className="mt-2.5 text-[10px] leading-4 text-ink-muted">
                  These are the provider&apos;s modelled values for the current hour at the forecast
                  grid cell nearest this point, downscaled to ~90 m terrain. They are not a sensor
                  reading at your workplace.
                </p>
                {liveError ? (
                  <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] leading-4 text-rose-700">
                    Live request failed ({liveError}).{" "}
                    {snapshot ? "Showing the stored snapshot instead." : "Retry with Refresh."}
                  </p>
                ) : null}
                {snapshot?.data_note ? (
                  <p className="mt-2 text-[10px] leading-4 text-ink-muted">{snapshot.data_note}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="px-5 py-6">
              <p className="text-[12.5px] text-ink-soft">
                No conditions are available for this workplace yet. Open{" "}
                <Link className="font-medium text-teal-700 hover:underline" href="/weather">
                  Live weather
                </Link>{" "}
                to select a workplace, then return here or press Refresh.
              </p>
            </div>
          )}
        </section>

        <div className="space-y-4">
          {lat !== undefined && lon !== undefined ? (
            <LocationMap latitude={lat} longitude={lon} name={workplaceName} className="h-[190px]" />
          ) : (
            <div className="card grid h-[190px] place-items-center px-5 text-center">
              <div>
                <MapPin className="mx-auto h-6 w-6 text-teal-700" />
                <p className="mt-2 text-[12.5px] font-medium text-navy-900">No workplace location</p>
                <Button asChild size="sm" variant="secondary" className="mt-3">
                  <Link href="/weather">Select location</Link>
                </Button>
              </div>
            </div>
          )}

          {snapshot ? (
            <div className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="label-caps">Snapshot used by latest run</p>
                <Badge tone="neutral">
                  {ageMinutes !== null ? `${Math.round(ageMinutes)} MIN OLD` : "STORED"}
                </Badge>
              </div>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-navy-950">
                {snapshot.location?.name ?? "Stored scenario"}
              </p>
              <p className="text-[10.5px] text-ink-muted">
                Retrieved {formatDate(snapshot.retrieved_at)}
                {snapshot.provider ? ` · ${snapshot.provider}` : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
                <PolicyMini
                  label="Temp at retrieval"
                  value={
                    snapshot.current ? `${formatNumber(snapshot.current.temperature, 1)}°C` : "—"
                  }
                />
                <PolicyMini
                  label="Shift window"
                  value={
                    snapshot.shift
                      ? `${String(snapshot.shift.start_hour).padStart(2, "0")}:00–${String(
                          snapshot.shift.end_hour,
                        ).padStart(2, "0")}:00`
                      : "—"
                  }
                />
                <PolicyMini label="Forecast date" value={snapshot.forecast_date ?? "—"} />
                <PolicyMini
                  label="Shift hours"
                  value={snapshot.shift?.hours ? `${snapshot.shift.hours} h` : "—"}
                />
              </div>
              <div className="mt-2 space-y-1.5">
                {snapshot.shift?.conditions?.slice(0, 3).map((hour) => (
                  <div
                    key={hour.hour}
                    className="flex items-center justify-between border-b border-line/70 pb-1 text-[10.5px] last:border-0"
                  >
                    <span className="font-mono text-ink-muted">
                      {String(hour.hour).padStart(2, "0")}:00
                    </span>
                    <span className="text-ink-soft">{formatNumber(hour.temperature, 1)}°C</span>
                    <span className="text-ink-muted">{formatNumber(hour.humidity, 0)}% RH</span>
                  </div>
                ))}
              </div>
              {latestId ? (
                <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                  <Link href={`/results/${latestId}`}>
                    Open stored results <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <p className="label-caps">Current policy</p>
              <Settings2 className="h-3.5 w-3.5 text-ink-muted" />
            </div>
            <p className="mt-1.5 truncate text-[13px] font-semibold text-navy-950">
              {String(latest?.policy?.name ?? "No policy loaded")}
            </p>
            {latest?.policy ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
                <PolicyMini label="Deadline pressure" value={`${Math.round(Number(latest.policy.deadline_pressure) * 100)}%`} />
                <PolicyMini label="Break protection" value={`${Math.round(Number(latest.policy.break_compensation) * 100)}%`} />
                <PolicyMini label="Protected break" value={`${latest.policy.protected_break_minutes ?? 0} min`} />
                <PolicyMini label="Incentive index" value={`${formatNumber(latest.policy.incentive_pressure_index, 0)}/100`} />
              </div>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
              <Link href="/policies">
                Manage policies <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Workers simulated"
          value={metrics ? formatNumber(metrics.population.workers, 0) : "—"}
          hint={
            breakdown?.saved
              ? `${breakdown.synthetic} synthetic + ${breakdown.saved} saved`
              : savedTotal > 0
                ? `${savedTotal} saved profile${savedTotal === 1 ? "" : "s"} available`
                : metrics
                  ? "Latest simulation"
                  : "Run a simulation"
          }
          icon={<Users className="h-4 w-4" />}
          accent="navy"
        />
        <StatCard
          label="Heat exposure index"
          value={metrics ? formatNumber(metrics.exposure_index, 1) : "—"}
          unit="/100"
          delta={metrics?.delta_vs_baseline?.exposure_index}
          deltaTone="good"
          hint="vs. no-protection baseline"
          icon={<ThermometerSun className="h-4 w-4" />}
          accent="heat"
          series={exposureSeries.map((point) => point.heat)}
        />
        <StatCard
          label="Break accessibility"
          value={metrics ? formatPercent(metrics.break_accessibility, 1) : "—"}
          delta={metrics?.delta_vs_baseline?.break_accessibility}
          deltaTone="good"
          hint="model estimate"
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="teal"
        />
        <StatCard
          label="Income retention"
          value={metrics ? formatPercent(metrics.income_retention, 1) : "—"}
          delta={metrics?.delta_vs_baseline?.income_retention}
          deltaTone="good"
          hint="vs. baseline earnings"
          icon={<Wallet className="h-4 w-4" />}
          accent="navy"
        />
        <StatCard
          label="Operational efficiency"
          value={metrics ? formatPercent(metrics.operational_efficiency, 1) : "—"}
          delta={metrics?.delta_vs_baseline?.operational_efficiency}
          deltaTone="neutral"
          hint="coverage-adjusted"
          icon={<Activity className="h-4 w-4" />}
          accent="teal"
        />
      </section>

      {/* Quick actions */}
      <section className="card flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Quick actions</span>
        <Button asChild size="sm" variant="secondary">
          <Link href="/weather"><MapPin className="h-3.5 w-3.5" /> Select location</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href="/policies"><Settings2 className="h-3.5 w-3.5" /> Create policy</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href="/simulate"><Activity className="h-3.5 w-3.5" /> Run simulation</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href="/workers"><UserPlus className="h-3.5 w-3.5" /> Add workers</Link>
        </Button>
        {latestId ? (
          <>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/optimizer/${latestId}`}><GitBranch className="h-3.5 w-3.5" /> Optimize policies</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={api.reportUrl(latestId)} target="_blank" rel="noreferrer">
                <FileText className="h-3.5 w-3.5" /> Generate report
              </a>
            </Button>
          </>
        ) : null}
      </section>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">Estimated exposure trend</h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Hourly comparative heat indicator × exposure duration. Not WBGT.
              </p>
            </div>
            <Badge tone="navy">MODEL ESTIMATE</Badge>
          </div>
          <div className="mt-4 h-[240px]">
            {exposureSeries.length > 0 ? (
              <ExposureTrendChart data={exposureSeries} />
            ) : (
              <EmptyChart label="Run a simulation to plot hourly exposure." />
            )}
          </div>
        </section>

        <section className="card p-5">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Break accessibility</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Hypothetical logistic estimate, not observed behaviour.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-5">
            <div className="relative h-[170px] w-[170px] shrink-0">
              {metrics ? <BreakAccessibilityDonut value={metrics.break_accessibility} /> : null}
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="font-display text-[24px] font-bold text-navy-950">
                    {metrics ? formatPercent(metrics.break_accessibility, 0) : "—"}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-ink-muted">estimated access</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <MiniStat
                label="No-protection baseline"
                value={metrics?.baseline ? formatPercent(metrics.baseline.break_accessibility, 1) : "—"}
              />
              <MiniStat
                label="Workers below 50% access"
                value={metrics ? formatPercent(metrics.workers_with_low_accessibility, 1) : "—"}
              />
              <MiniStat
                label="Unpaid rest per worker"
                value={metrics ? `${formatNumber(metrics.unpaid_rest_hours_mean, 2)} h` : "—"}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">Income impact</h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">Distribution of estimated income retention across the simulated population.</p>
            </div>
            <Badge tone="teal">ESTIMATE</Badge>
          </div>
          <div className="mt-4 h-[200px]">
            {incomeSeries.length > 0 ? (
              <IncomeImpactChart data={incomeSeries} />
            ) : (
              <EmptyChart label="Income distribution appears after a simulation." />
            )}
          </div>
          {metrics ? (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              <MiniStat label="Retention" value={formatPercent(metrics.income_retention, 1)} />
              <MiniStat label="Loss / worker-shift" value={`${formatNumber(metrics.income_loss_per_worker_shift, 2)}`} />
            </div>
          ) : null}
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">Policy comparison overview</h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">Current policy vs. the engine&apos;s no-protection counterfactual.</p>
            </div>
            {latestId ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/optimizer/${latestId}`}>
                  <GitBranch className="h-3.5 w-3.5" /> Open optimizer
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-mist-50 text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  <th className="px-5 py-2.5 font-semibold">Indicator</th>
                  <th className="px-3 py-2.5 font-semibold">Policy</th>
                  <th className="px-3 py-2.5 font-semibold">No-protection baseline</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Change</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Heat exposure index", metrics?.exposure_index, metrics?.baseline?.exposure_index, "lower"],
                  ["Break accessibility", metrics?.break_accessibility, metrics?.baseline?.break_accessibility, "higher"],
                  ["Income retention", metrics?.income_retention, metrics?.baseline?.income_retention, "higher"],
                  ["Operational disruption", metrics?.operational_disruption, metrics?.baseline?.operational_disruption, "lower"],
                ].map(([label, value, baseline, better]) => {
                  const delta = typeof value === "number" && typeof baseline === "number" ? value - baseline : null;
                  const good =
                    delta === null ? null : better === "higher" ? delta > 0 : delta < 0;
                  return (
                    <tr key={String(label)} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-3 font-medium text-navy-900">{label}</td>
                      <td className="px-3 py-3 font-mono text-ink-soft">
                        {typeof value === "number" ? formatNumber(value, 1) : "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-ink-muted">
                        {typeof baseline === "number" ? formatNumber(baseline, 1) : "—"}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${good === null ? "text-ink-muted" : good ? "text-teal-700" : "text-heat-700"}`}>
                        {delta === null ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta, 1)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line bg-mist-50 px-5 py-2.5 text-[10px] leading-4 text-ink-muted">
            Lower exposure is better; higher access and retention are better; lower operational
            disruption is better. These are model estimates on one weather snapshot.
          </p>
        </section>
      </div>

      {/* Recent simulations */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Recent simulations</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">Stored runs for this organization, newest first.</p>
          </div>
          <Badge tone="neutral">{data?.counts.simulations ?? 0} total</Badge>
        </div>
        {data?.recent_simulations?.length ? (
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
                  <th className="px-5 py-2.5 text-right font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_simulations.slice(0, 8).map((run) => (
                  <tr key={run.id} className="border-b border-line/70 last:border-0 hover:bg-mist-100/60">
                    <td className="px-5 py-3">
                      <Link href={`/results/${run.id}`} className="font-medium text-navy-900 hover:text-teal-700">
                        {run.label || run.id.slice(0, 8)}
                      </Link>
                      <p className="mt-0.5 max-w-[220px] truncate text-[10px] text-ink-muted">{run.policy_name}</p>
                    </td>
                    <td className="px-3 py-3 text-ink-soft">
                      {run.weather_location ?? run.scenario_name ?? "—"}
                      {run.weather_type ? <span className="ml-1 text-[9px] uppercase text-heat-700">forecast</span> : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{run.population_size ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{formatNumber(run.exposure_index, 1)}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(run.income_retention, 1)}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{formatPercent(run.break_accessibility, 1)}</td>
                    <td className="px-5 py-3 text-right text-[10.5px] text-ink-muted">{formatDate(run.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <BarChart3 className="mx-auto h-6 w-6 text-ink-muted" />
            <p className="mt-2 text-[12px] text-ink-muted">No simulation history yet.</p>
          </div>
        )}
      </section>

      <p className="pb-2 text-[10px] leading-5 text-ink-muted">
        HeatFair is a decision-support prototype. Synthetic workers are not real employee records,
        and worker profiles you save yourself are your own inputs, not measured observations.
        Open-Meteo values are modelled grid-cell forecasts, not on-site sensor measurements. Model
        coefficients are illustrative and not a certified occupational safety assessment.
      </p>
    </div>
  );
}

function minutesSince(iso?: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (Date.now() - time) / 60_000);
}

function ChartLoader() {
  return <div className="h-full w-full animate-pulse rounded-xl bg-mist-100" />;
}

function PolicyMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-muted">{label}</p>
      <p className="font-mono font-semibold text-navy-900">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-ink-muted">{label}</p>
      <p className="mt-0.5 font-mono text-[13px] font-semibold text-navy-900">{value}</p>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-dashed border-line bg-mist-50">
      <div className="text-center">
        <BarChart3 className="mx-auto h-5 w-5 text-ink-muted" />
        <p className="mt-1.5 text-[11px] text-ink-muted">{label}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-mist-300" />
        <div className="h-8 w-80 animate-pulse rounded bg-mist-300" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="h-[320px] animate-pulse rounded-2xl bg-white" />
        <div className="h-[320px] animate-pulse rounded-2xl bg-white" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[124px] animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stored dashboard data…
      </div>
    </div>
  );
}
