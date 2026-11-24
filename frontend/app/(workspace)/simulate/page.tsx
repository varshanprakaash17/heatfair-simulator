"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudSun,
  Dices,
  Gauge,
  Loader2,
  MapPin,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LocationSearch } from "@/components/LocationSearch";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { Policy, WeatherPayload } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

const WORKER_COUNTS = [100, 250, 500, 1000];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Phase = "idle" | "weather" | "server" | "done" | "error";

export default function SimulatePage() {
  const router = useRouter();
  const { bootstrap, location, setLocation, policies } = useWorkspace();
  const [policyId, setPolicyId] = useState("");
  const [workers, setWorkers] = useState(500);
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(14);
  const [seed, setSeed] = useState(42);
  const [includeSaved, setIncludeSaved] = useState(true);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.id === policyId) ?? null,
    [policies, policyId],
  );

  useEffect(() => {
    if (!policyId && policies.length > 0) setPolicyId(policies[0].id);
  }, [policies, policyId]);

  const loadWeather = useCallback(
    async (force = false) => {
      if (!location) return;
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const data = await api.weatherForecast(location.latitude, location.longitude, {
          name: location.name,
          startHour,
          endHour,
          force,
        });
        setWeather(data);
      } catch (err) {
        setWeather(null);
        setWeatherError(
          err instanceof ApiError
            ? err.message
            : "Could not retrieve live weather for this location.",
        );
      } finally {
        setWeatherLoading(false);
      }
    },
    [location, startHour, endHour],
  );

  useEffect(() => {
    void loadWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude, startHour, endHour]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phase !== "weather" && phase !== "server") return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const validation = useMemo(() => {
    if (!location) return "Select a workplace location.";
    if (!bootstrap) return "Loading organization…";
    if (!selectedPolicy) return "Select a saved workplace policy.";
    if (endHour <= startHour) return "Shift end must be later than shift start.";
    if (!WORKER_COUNTS.includes(workers)) return "Choose 100, 250, 500 or 1,000 synthetic workers.";
    if (!Number.isInteger(seed) || seed < 0 || seed > 4_294_967_295)
      return "Seed must be a whole number between 0 and 4,294,967,295.";
    if (weatherError) return "Live weather must load successfully before a run.";
    if (!weather) return "Waiting for the live weather forecast.";
    return null;
  }, [location, bootstrap, selectedPolicy, startHour, endHour, workers, seed, weather, weatherError]);

  const shiftHours = Math.max(0, endHour - startHour);
  const cappedHours = selectedPolicy ? Math.min(shiftHours, selectedPolicy.max_shift_hours) : shiftHours;
  const weatherAge = weather ? now - new Date(weather.retrieved_at).getTime() : null;

  async function run() {
    if (!bootstrap || !location || !selectedPolicy || validation) {
      setRunError(validation ?? "Complete the configuration first.");
      return;
    }
    setRunError(null);
    setPhase("weather");
    try {
      // This is a real request; the stage completes only when it returns.
      const fresh = await api.weatherForecast(location.latitude, location.longitude, {
        name: location.name,
        startHour,
        endHour,
        force: true,
      });
      setWeather(fresh);
      setPhase("server");
      const response = await api.runSimulation({
        organization_id: bootstrap.organization.id,
        policy_id: selectedPolicy.id,
        latitude: location.latitude,
        longitude: location.longitude,
        location_name: location.name,
        work_start_hour: startHour,
        work_end_hour: endHour,
        population_size: workers,
        random_seed: seed,
        include_saved_workers: includeSaved,
        label: `${location.name.split(",")[0]} · ${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:00`,
      });
      setPhase("done");
      router.push(`/results/${response.simulation.id}?new=1`);
    } catch (err) {
      setPhase("error");
      setRunError(
        err instanceof ApiError
          ? err.message
          : "The simulation could not be completed. No results were fabricated; check the backend logs.",
      );
    }
  }

  function randomSeed() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    setSeed(values[0]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Simulation control centre"
        title="Run a live-weather policy simulation"
        description="The backend retrieves weather for the selected coordinate and window, stores a snapshot, generates synthetic workers, evaluates the policy and persists the results. Re-running with the same seed and inputs is reproducible."
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href="/policies">
              <Settings2 className="h-3.5 w-3.5" /> Policies
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          {/* Location */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-caps">Step 01</p>
                <h2 className="mt-1 text-[15px] font-semibold text-navy-950">Workplace location</h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  HeatFair uses this coordinate for live conditions and the hourly forecast.
                </p>
              </div>
              <Badge tone={location ? "teal" : "neutral"}>{location ? "SELECTED" : "REQUIRED"}</Badge>
            </div>

            <div className="mt-4">
              <LocationSearch onSelect={setLocation} disabled={phase === "weather" || phase === "server"} />
            </div>

            {location ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-mist-50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-teal-700 shadow-sm">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold text-navy-900">{location.name}</p>
                    <p className="text-[10px] text-ink-muted">
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                      {weather?.location.timezone ? ` · ${weather.location.timezone}` : ""}
                    </p>
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/weather">
                    <CloudSun className="h-3.5 w-3.5" /> Inspect weather
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] text-ink-muted">
                No location selected. Search above or use browser geolocation; nothing is assumed.
              </p>
            )}
          </section>

          {/* Policy + population */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-caps">Step 02</p>
                <h2 className="mt-1 text-[15px] font-semibold text-navy-950">Policy, workers and shift</h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Synthetic profiles are generated with the seed below. No employee records are used.
                </p>
              </div>
              <Badge tone="amber">SYNTHETIC WORKER DATA</Badge>
            </div>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <Field label="Workplace policy" hint="Saved policy definitions come from the policy builder.">
                <Select value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
                  <option value="" disabled>
                    Select a policy
                  </option>
                  {policies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Random seed"
                hint="Controls synthetic worker generation. Reuse a seed to reproduce a population."
              >
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={4_294_967_295}
                    value={seed}
                    onChange={(event) => setSeed(Number(event.target.value))}
                    className="font-mono"
                    aria-label="Random seed"
                  />
                  <Button type="button" variant="secondary" onClick={randomSeed} aria-label="Generate a random seed">
                    <Dices className="h-4 w-4" />
                  </Button>
                </div>
              </Field>
            </div>

            {selectedPolicy ? (
              <div className="mt-4 rounded-xl border border-line bg-mist-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11.5px] font-semibold text-navy-900">{selectedPolicy.name}</p>
                  <span className="font-mono text-[10.5px] text-ink-muted">
                    incentive index {formatNumber(selectedPolicy.incentive_pressure_index, 0)}/100
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10.5px] sm:grid-cols-4">
                  <PolicyFact label="Deadline" value={`${Math.round(selectedPolicy.deadline_pressure * 100)}%`} />
                  <PolicyFact label="Bonus dependency" value={`${Math.round(selectedPolicy.bonus_dependency * 100)}%`} />
                  <PolicyFact label="Protected break" value={`${selectedPolicy.protected_break_minutes} min`} />
                  <PolicyFact label="Paid breaks" value={selectedPolicy.paid_breaks ? "Yes" : "No"} />
                  <PolicyFact label="Flexible deadlines" value={selectedPolicy.flexible_deadlines ? "Yes" : "No"} />
                  <PolicyFact label="Safety-delay penalty" value={selectedPolicy.penalise_safety_delays ? "Yes" : "No"} />
                  <PolicyFact label="Maximum shift" value={`${selectedPolicy.max_shift_hours} h`} />
                  <PolicyFact label="Budget" value={`$${formatNumber(selectedPolicy.budget_limit, 0)}`} />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-heat-200 bg-heat-50 px-3.5 py-3 text-[11.5px] text-heat-800">
                No saved policy selected.{" "}
                <Link href="/policies" className="font-medium underline">
                  Create one in the policy builder
                </Link>
                .
              </div>
            )}

            <div className="mt-5">
              <p className="text-[12.5px] font-medium text-ink-soft">Synthetic workers</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WORKER_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setWorkers(count)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-all",
                      workers === count
                        ? "border-teal-500 bg-teal-50 shadow-sm"
                        : "border-line bg-white hover:border-navy-200",
                    )}
                  >
                    <p className={cn("font-mono text-[17px] font-semibold", workers === count ? "text-teal-800" : "text-navy-900")}>
                      {count.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-muted">workers</p>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-ink-muted">
                Occupations, wages, work intensity and workload are drawn from documented distributions
                using seed {seed}.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-mist-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={includeSaved}
                  onChange={(event) => setIncludeSaved(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-line accent-teal-600"
                />
                <span>
                  <span className="block text-[11.5px] font-medium text-navy-900">
                    Include my saved worker profiles
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-ink-muted">
                    Saved profiles from the Workers page take slots in this population first; synthetic
                    profiles fill the rest, so the total stays {workers.toLocaleString()}.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <Field label="Work start" hint="Local time at the workplace.">
                <Select value={startHour} onChange={(event) => setStartHour(Number(event.target.value))}>
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Work end" hint={`${shiftHours} hour window.`}>
                <Select value={endHour} onChange={(event) => setEndHour(Number(event.target.value))}>
                  {HOURS.map((hour) => hour + 1).map((hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {selectedPolicy && shiftHours > selectedPolicy.max_shift_hours ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-heat-200 bg-heat-50 px-3 py-2 text-[10.5px] leading-4 text-heat-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The requested window is {shiftHours} h, but this policy caps evaluated exposure at{" "}
                {selectedPolicy.max_shift_hours} h. The cap is recorded in the results.
              </div>
            ) : null}

            {runError ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11.5px] leading-5 text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{runError}</span>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[10.5px] text-ink-muted">
                <p>
                  Model snapshot: weather + policy + {workers.toLocaleString()} worker profiles
                  {includeSaved ? " (saved profiles included)" : " (synthetic only)"}
                </p>
                <p className="mt-0.5">
                  Evaluated duration {cappedHours} h · seed {seed}
                </p>
              </div>
              <Button
                variant="navy"
                size="lg"
                onClick={run}
                disabled={Boolean(validation) || phase === "weather" || phase === "server"}
                className="sm:min-w-[250px]"
              >
                {phase === "weather" || phase === "server" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                RUN HEATFAIR SIMULATION
              </Button>
            </div>
            {validation ? <p className="mt-2 text-right text-[10.5px] text-heat-700">{validation}</p> : null}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div>
                <h2 className="text-[13px] font-semibold text-navy-950">Live forecast preview</h2>
                <p className="mt-0.5 text-[10px] text-ink-muted">Same coordinates and shift window</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadWeather(true)}
                disabled={!location || weatherLoading || phase === "weather" || phase === "server"}
              >
                {weatherLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudSun className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {weatherLoading && !weather ? (
              <div className="space-y-3 p-4">
                <div className="h-16 animate-pulse rounded-xl bg-mist-100" />
                <div className="h-24 animate-pulse rounded-xl bg-mist-100" />
                <p className="text-[10.5px] text-ink-muted">Retrieving Open-Meteo forecast…</p>
              </div>
            ) : weatherError ? (
              <div className="p-4">
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10.5px] leading-4 text-rose-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{weatherError}</span>
                </div>
                <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => void loadWeather(true)}>
                  Retry weather
                </Button>
                <p className="mt-2 text-[10px] leading-4 text-ink-muted">
                  A simulation will not run without a successful live weather response. No sample
                  weather is substituted.
                </p>
              </div>
            ) : weather ? (
              <div>
                <div className="flex items-center justify-between px-4 py-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="teal" className="px-1.5 py-0 text-[8.5px]">LIVE</Badge>
                      <Badge tone="amber" className="px-1.5 py-0 text-[8.5px]">FORECAST</Badge>
                    </div>
                    <p className="mt-2 text-[11.5px] font-medium text-navy-900">{location?.name}</p>
                    <p className="mt-0.5 text-[10px] text-ink-muted">{weather.current?.weather_condition}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[28px] font-bold leading-none text-navy-950">
                      {formatNumber(weather.current?.temperature, 1)}°
                    </p>
                    <p className="mt-1 text-[10px] text-heat-700">
                      feels {formatNumber(weather.current?.apparent_temperature, 1)}°
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px border-y border-line bg-line">
                  <div className="bg-white px-4 py-2.5">
                    <p className="text-[9.5px] text-ink-muted">Shift window</p>
                    <p className="mt-0.5 font-mono text-[11px] font-semibold text-navy-900">
                      {String(startHour).padStart(2, "0")}:00–{String(endHour).padStart(2, "0")}:00
                    </p>
                  </div>
                  <div className="bg-white px-4 py-2.5">
                    <p className="text-[9.5px] text-ink-muted">Forecast date</p>
                    <p className="mt-0.5 font-mono text-[11px] font-semibold text-navy-900">
                      {weather.shift?.date ?? weather.forecast_date ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 px-4 py-3">
                  {weather.shift?.conditions.slice(0, 5).map((hour) => (
                    <div key={hour.hour} className="flex items-center justify-between text-[10.5px]">
                      <span className="font-mono text-ink-muted">{String(hour.hour).padStart(2, "0")}:00</span>
                      <span className="text-ink-soft">{formatNumber(hour.temperature, 1)}°C</span>
                      <span className="text-ink-muted">{formatNumber(hour.humidity, 0)}% RH</span>
                    </div>
                  )) ?? <p className="text-[10.5px] text-ink-muted">No hourly detail returned.</p>}
                </div>
                <div className="border-t border-line bg-mist-50 px-4 py-2.5">
                  <p className="text-[9.5px] leading-4 text-ink-muted">
                    {weather.data_note}
                  </p>
                  <p className="mt-1 text-[9.5px] text-ink-muted">
                    Retrieved {formatDate(weather.retrieved_at)}
                    {weatherAge !== null ? ` · ${Math.max(0, Math.round(weatherAge / 60000))} min ago` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <MapPin className="mx-auto h-5 w-5 text-ink-muted" />
                <p className="mt-2 text-[11px] text-ink-muted">Select a location to preview live weather.</p>
              </div>
            )}
          </section>

          <section className="card p-4">
            <p className="label-caps">What will be stored</p>
            <ul className="mt-2.5 space-y-2 text-[10.5px] leading-4 text-ink-muted">
              {[
                "A weather snapshot with retrieval time, provider timestamp and forecast designation",
                "Policy configuration and the model version",
                "Synthetic worker profiles and the random seed",
                "Metrics, distributions and the no-protection baseline",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-mist-50 px-2.5 py-2 text-[9.5px] leading-4 text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              Estimates only. Not a certified safety assessment or a prediction of individual injury.
            </div>
          </section>

          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: ThermometerSun, label: "Exposure", tone: "heat" },
              { icon: Wallet, label: "Income", tone: "teal" },
              { icon: Gauge, label: "Operations", tone: "navy" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-line bg-white px-2.5 py-2.5 text-center">
                <item.icon className={cn("mx-auto h-4 w-4", item.tone === "heat" ? "text-heat-600" : item.tone === "teal" ? "text-teal-700" : "text-navy-700")} />
                <p className="mt-1 text-[9.5px] text-ink-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {phase !== "idle" ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-navy-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-caps text-teal-700">
                  {phase === "done" ? "Complete" : phase === "error" ? "Run interrupted" : "Simulation in progress"}
                </p>
                <h2 className="mt-1.5 font-display text-[20px] font-bold text-navy-950">
                  {phase === "done"
                    ? "Results are ready"
                    : phase === "error"
                      ? "The simulation did not complete"
                      : "Running HeatFair"}
                </h2>
              </div>
              {phase === "error" ? (
                <button
                  type="button"
                  onClick={() => setPhase("idle")}
                  className="rounded-lg p-1 text-ink-muted hover:bg-mist-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-2.5">
              <Stage
                label="Fetching live weather"
                detail={location?.name ?? "Open-Meteo forecast"}
                state={phase === "weather" ? "active" : phase === "server" || phase === "done" ? "complete" : phase === "error" ? "error" : "pending"}
              />
              <Stage
                label="Building the worker population"
                detail={`${workers.toLocaleString()} profiles · seed ${seed}`}
                state={phase === "server" ? "active" : phase === "done" ? "complete" : "pending"}
                indeterminate
              />
              <Stage
                label="Evaluating workplace policy"
                detail={selectedPolicy?.name ?? "Policy"}
                state={phase === "server" ? "active" : phase === "done" ? "complete" : "pending"}
                indeterminate
              />
              <Stage
                label="Running simulation and calculating results"
                detail={`${cappedHours} h shift · model executes server-side`}
                state={phase === "server" ? "active" : phase === "done" ? "complete" : "pending"}
                indeterminate
              />
            </div>

            {phase === "weather" || phase === "server" ? (
              <div className="mt-5">
                <div className="relative h-1.5 overflow-hidden rounded-full bg-mist-200">
                  <div className="absolute inset-y-0 left-0 w-1/3 animate-progress rounded-full bg-teal-500" />
                </div>
                <p className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
                  <span>
                    {phase === "weather"
                      ? "Waiting for the weather provider…"
                      : "Backend is executing the engine; results appear when the request completes."}
                  </span>
                  <span className="font-mono">{elapsed}s</span>
                </p>
              </div>
            ) : null}

            {phase === "error" ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[11.5px] leading-5 text-rose-800">
                {runError}
              </div>
            ) : null}

            {phase === "error" ? (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
                  Close
                </Button>
                <Button
                  variant="navy"
                  size="sm"
                  onClick={() => {
                    setPhase("idle");
                    void run();
                  }}
                >
                  <Play className="h-3.5 w-3.5" /> Retry run
                </Button>
              </div>
            ) : null}

            <p className="mt-4 border-t border-line pt-3 text-[9.5px] leading-4 text-ink-muted">
              Stage status reflects actual requests. Server-side steps are executed together; they are
              not marked complete until the API returns real results.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-muted">{label}</p>
      <p className="font-medium text-navy-900">{value}</p>
    </div>
  );
}

function Stage({
  label,
  detail,
  state,
  indeterminate,
}: {
  label: string;
  detail: string;
  state: "pending" | "active" | "complete" | "error";
  indeterminate?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        state === "active"
          ? "border-teal-200 bg-teal-50/60"
          : state === "complete"
            ? "border-line bg-white"
            : state === "error"
              ? "border-rose-200 bg-rose-50"
              : "border-line bg-mist-50 opacity-70",
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full",
          state === "active"
            ? "bg-teal-600 text-white"
            : state === "complete"
              ? "bg-teal-50 text-teal-700"
              : state === "error"
                ? "bg-rose-100 text-rose-700"
                : "bg-mist-200 text-ink-muted",
        )}
      >
        {state === "complete" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : state === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "error" ? (
          <X className="h-3.5 w-3.5" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[11.5px] font-medium", state === "pending" ? "text-ink-muted" : "text-navy-900")}>
          {label}
        </p>
        <p className="truncate text-[9.5px] text-ink-muted">{detail}</p>
      </div>
      {state === "active" ? (
        <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.08em] text-teal-700">
          {indeterminate ? "server" : "live"}
        </span>
      ) : null}
    </div>
  );
}
