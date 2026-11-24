"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Clock,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sun,
  ThermometerSun,
  Wind,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LocationSearch } from "@/components/LocationSearch";
import { LocationMap } from "@/components/LocationMap";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { SelectedLocation, WeatherPayload } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

// Recharts is a large dependency; load it after the conditions panel paints.
const ForecastChartsLazy = dynamic(
  () => import("@/components/weather/ForecastCharts").then((module) => module.ForecastCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[250px] animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    ),
  },
);

const REFRESH_MS = 15 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;

export default function WeatherPage() {
  const { location, setLocation } = useWorkspace();
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(18);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    async (target: SelectedLocation, force = false) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.weatherForecast(target.latitude, target.longitude, {
          name: target.name,
          startHour,
          endHour,
          force,
        });
        setWeather(data);
        setLastSuccess(new Date());
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Live weather could not be retrieved. No synthetic readings have been substituted.",
        );
      } finally {
        setLoading(false);
      }
    },
    [startHour, endHour],
  );

  useEffect(() => {
    if (location) void load(location);
    // Reload when the shift window changes too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude, startHour, endHour]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!location) return;
    const timer = window.setInterval(() => void load(location), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [location, load]);

  const shift = weather?.shift;
  const chartData = useMemo(
    () =>
      (shift?.conditions ?? []).map((hour) => ({
        hour: `${String(hour.hour).padStart(2, "0")}:00`,
        temperature: hour.temperature,
        apparent: hour.apparent_temperature,
        humidity: hour.humidity,
        solar: hour.solar_radiation,
        wind: hour.wind_speed,
      })),
    [shift?.conditions],
  );

  const retrievedAt = weather ? new Date(weather.retrieved_at) : null;
  const stale = retrievedAt ? now - retrievedAt.getTime() > STALE_MS : false;
  const current = weather?.current;
  const WeatherIcon = current ? iconFor(current.weather_code, current.is_day) : CloudSun;

  function onSelect(next: SelectedLocation) {
    setLocation(next);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live weather & location"
        title="The actual forecast for your workplace"
        description="Search a city, detect your location, and retrieve Open-Meteo current conditions plus hourly forecast values for the shift window. HeatFair never asks you to type a temperature."
        actions={
          weather ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => location && load(location, true)}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh weather
            </Button>
          ) : null
        }
      />

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-navy-950">Select a workplace location</h2>
              <Badge tone="teal">OPEN-METEO GEOCODING</Badge>
            </div>
            <p className="mt-1 text-[11.5px] text-ink-muted">
              Latitude and longitude are resolved from the place name. Browser geolocation is used only
              when you press “Detect my location”.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">
              Shift start
              <Select
                value={startHour}
                onChange={(event) => setStartHour(Number(event.target.value))}
                className="mt-1 h-9 w-[94px] text-[12px]"
              >
                {Array.from({ length: 19 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">
              Shift end
              <Select
                value={endHour}
                onChange={(event) => setEndHour(Number(event.target.value))}
                className="mt-1 h-9 w-[94px] text-[12px]"
              >
                {Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>
        <div className="mt-4">
          <LocationSearch onSelect={onSelect} disabled={loading} />
        </div>

        {location ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-mist-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-teal-700" />
              <div>
                <p className="text-[12px] font-semibold text-navy-900">{location.name}</p>
                <p className="text-[10px] text-ink-muted">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </p>
              </div>
            </div>
            {weather?.location.timezone ? (
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">Timezone</p>
                <p className="text-[11px] font-medium text-ink-soft">
                  {weather.location.timezone} ({weather.location.timezone_abbreviation})
                </p>
              </div>
            ) : null}
            {shift ? (
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">Requested window</p>
                <p className="text-[11px] font-medium text-ink-soft">
                  {shift.date} · {String(shift.start_hour).padStart(2, "0")}:00–{String(shift.end_hour).padStart(2, "0")}:00
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {!location ? (
        <section className="card grid place-items-center px-6 py-16 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
              <MapPin className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-[18px] font-semibold text-navy-950">Choose where your workers are</h2>
            <p className="mt-1.5 text-[12.5px] leading-6 text-ink-muted">
              Search above or use your browser location. HeatFair will retrieve live modelled
              conditions and the hourly forecast for that coordinate.
            </p>
            <Button asChild variant="navy" className="mt-5">
              <a href="/simulate">Continue to simulation</a>
            </Button>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="text-[12.5px] font-semibold text-rose-800">Live weather request failed</p>
                <p className="mt-0.5 max-w-2xl text-[11.5px] leading-5 text-rose-700">{error}</p>
                {weather && lastSuccess ? (
                  <p className="mt-1 text-[10.5px] text-rose-700/80">
                    Showing the last successful snapshot from {lastSuccess.toLocaleTimeString()}. It is
                    not being presented as current.
                  </p>
                ) : null}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => location && load(location, true)} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry
            </Button>
          </div>
        </section>
      ) : null}

      {loading && !weather ? <WeatherSkeleton /> : null}

      {weather ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="teal" className="gap-1.5 px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> LIVE WEATHER DATA
              </Badge>
              <Badge tone="amber">FORECAST · MODELLED CONDITIONS</Badge>
              {weather.cached ? <Badge tone="neutral">CACHED {Math.round(weather.cache_age_seconds ?? 0)}s</Badge> : null}
              {stale ? (
                <Badge tone="rose" className="gap-1">
                  <ShieldAlert className="h-3 w-3" /> STALE SNAPSHOT
                </Badge>
              ) : null}
            </div>
            <p className="text-[10.5px] text-ink-muted">
              Last successful retrieval: {lastSuccess ? lastSuccess.toLocaleTimeString() : formatDate(weather.retrieved_at)}
            </p>
          </div>

          {stale ? (
            <div className="rounded-xl border border-heat-200 bg-heat-50 px-4 py-2.5 text-[11.5px] text-heat-800">
              This snapshot is more than 30 minutes old. Refresh before making a decision; the
              automatic refresh runs every 15 minutes while this page is open.
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <section className="card overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-heat-50 text-heat-600">
                      <WeatherIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                        Current modelled conditions
                      </p>
                      <h2 className="mt-0.5 text-[17px] font-semibold text-navy-950">
                        {weather.location.name}
                      </h2>
                      <p className="text-[11px] text-ink-muted">
                        {current?.weather_condition ?? "Condition unavailable"} ·{" "}
                        {weather.location.timezone ?? "local time"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[38px] font-bold leading-none text-navy-950">
                      {formatNumber(current?.temperature, 1)}
                      <span className="ml-1 text-[16px] font-medium text-ink-muted">°C</span>
                    </p>
                    <p className="mt-1 text-[11px] text-heat-700">
                      Feels like {formatNumber(current?.apparent_temperature, 1)}°C
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
                {[
                  { icon: Droplets, label: "Relative humidity", value: `${formatNumber(current?.humidity, 0)}%` },
                  { icon: Wind, label: "Wind speed", value: `${formatNumber(current?.wind_speed, 1)} km/h` },
                  { icon: Sun, label: "Solar radiation", value: `${formatNumber(current?.shortwave_radiation, 0)} W/m²` },
                  { icon: Cloud, label: "Cloud cover", value: `${formatNumber(current?.cloud_cover, 0)}%` },
                  { icon: Wind, label: "Wind gusts", value: `${formatNumber(current?.wind_gusts, 1)} km/h` },
                  { icon: Droplets, label: "Precipitation", value: `${formatNumber(current?.precipitation, 2)} mm` },
                ].map((item) => (
                  <div key={item.label} className="bg-white px-4 py-3">
                    <p className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                      <item.icon className="h-3 w-3" /> {item.label}
                    </p>
                    <p className="mt-1 font-mono text-[14px] font-semibold text-navy-900">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-line bg-mist-50 px-5 py-3">
                <dl className="grid gap-x-6 gap-y-1.5 text-[10.5px] sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Data source</dt>
                    <dd className="text-right font-medium text-ink-soft">{weather.provider}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Provider timestamp</dt>
                    <dd className="text-right font-medium text-ink-soft">{weather.source_timestamp ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Retrieved by HeatFair</dt>
                    <dd className="text-right font-medium text-ink-soft">{formatDate(weather.retrieved_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Data designation</dt>
                    <dd className="text-right font-medium text-heat-800">Modelled forecast</dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="space-y-4">
              <LocationMap
                latitude={location?.latitude ?? weather.location.latitude}
                longitude={location?.longitude ?? weather.location.longitude}
                name={weather.location.name}
                className="h-[235px]"
              />
              <div className="card p-4">
                <p className="label-caps flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> What this data is
                </p>
                <p className="mt-2 text-[11px] leading-5 text-ink-soft">{weather.data_note}</p>
                <p className="mt-2 text-[10.5px] leading-4 text-ink-muted">
                  “Current” means the provider&apos;s modelled value for the current hour, not a
                  thermometer at your workplace. Later hours are forecasts, not observations.
                </p>
                {weather.missing_variables?.length ? (
                  <p className="mt-2 rounded-lg border border-heat-200 bg-heat-50 px-2.5 py-1.5 text-[10px] text-heat-800">
                    Missing variables: {weather.missing_variables.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <ForecastChartsLazy
            data={chartData}
            dateLabel={shift?.date ?? "the selected window"}
          />

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[14px] font-semibold text-navy-950">Shift forecast detail</h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Every hour used by a simulation for this window. All times are local to the workplace.
                </p>
              </div>
              <Badge tone="amber">{shift?.hours ?? 0} forecast hours</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-mist-50 text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                    <th className="px-5 py-2.5 font-semibold">Hour</th>
                    <th className="px-3 py-2.5 font-semibold">Temperature</th>
                    <th className="px-3 py-2.5 font-semibold">Feels like</th>
                    <th className="px-3 py-2.5 font-semibold">Humidity</th>
                    <th className="px-3 py-2.5 font-semibold">Wind</th>
                    <th className="px-5 py-2.5 font-semibold">Solar</th>
                  </tr>
                </thead>
                <tbody>
                  {shift?.conditions.map((hour) => (
                    <tr key={hour.hour} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-2.5 font-mono font-medium text-navy-900">
                        {String(hour.hour).padStart(2, "0")}:00
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">{formatNumber(hour.temperature, 1)}°C</td>
                      <td className="px-3 py-2.5 text-ink-soft">{formatNumber(hour.apparent_temperature, 1)}°C</td>
                      <td className="px-3 py-2.5 text-ink-soft">{formatNumber(hour.humidity, 0)}%</td>
                      <td className="px-3 py-2.5 text-ink-soft">{formatNumber(hour.wind_speed, 1)} km/h</td>
                      <td className="px-5 py-2.5 text-ink-soft">{formatNumber(hour.solar_radiation, 0)} W/m²</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-[10.5px] text-ink-muted">
              <Clock className="h-3.5 w-3.5 text-teal-700" />
              Auto-refresh every 15 minutes · cache {weather.cached ? "hit" : "miss"} · provider timeout handled
              with a retry
            </p>
            <Button asChild size="sm" variant="navy">
              <a href="/simulate">Use this location in a simulation</a>
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function iconFor(code: number | null, isDay: number | null) {
  if (code === null) return CloudSun;
  if (code >= 61 && code <= 82) return CloudRain;
  if (code >= 95) return CloudRain;
  if (code <= 3) return isDay === 0 ? Cloud : Sun;
  return Cloud;
}

function WeatherSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-[310px] animate-pulse rounded-2xl bg-white" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[250px] animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
      <p className="flex items-center gap-2 text-[11.5px] text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Retrieving Open-Meteo forecast for the selected window…
      </p>
    </div>
  );
}
