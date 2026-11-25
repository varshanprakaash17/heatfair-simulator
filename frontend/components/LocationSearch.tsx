"use client";

import { useState } from "react";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { GeocodeResult, SelectedLocation } from "@/lib/types";
import { LocationMap } from "./LocationMap";
import { Button } from "./ui/button";
import { Input } from "./ui/form";

type PendingFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export function LocationSearch({
  onSelect,
  placeholder = "Search a city or workplace address",
  disabled,
}: {
  onSelect: (location: SelectedLocation) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [pendingFix, setPendingFix] = useState<PendingFix | null>(null);

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setSearched(true);
    try {
      const data = await api.geocode(query.trim());
      setResults(data.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Location search failed.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function detect() {
    if (!navigator.geolocation) {
      setError("This browser does not support geolocation.");
      return;
    }
    setLocating(true);
    setError(null);
    setPendingFix(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        // Show the fix and its accuracy before saving: a low-accuracy geolocation
        // result can be several kilometres away from the workplace.
        setPendingFix({ latitude, longitude, accuracy });
        setLocating(false);
        setResults([]);
      },
      (geoError) => {
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied. Search for a city or workplace instead."
            : geoError.code === geoError.TIMEOUT
              ? "Locating timed out. Move somewhere with a clearer signal or search for a city instead."
              : "Could not determine your location. Search for a city or workplace instead.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function confirmFix() {
    if (!pendingFix) return;
    const { latitude, longitude } = pendingFix;
    onSelect({
      name: `My location · ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
      latitude,
      longitude,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setPendingFix(null);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="pl-9"
            disabled={disabled}
            aria-label="Search workplace location"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="navy" disabled={searching || disabled} className="flex-1 sm:flex-none">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={detect}
            disabled={locating || disabled}
            className="flex-1 sm:flex-none"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            Detect my location
          </Button>
        </div>
      </form>

      {error ? (
        <p className="rounded-lg border border-heat-200 bg-heat-50 px-3 py-2 text-[11.5px] text-heat-800">
          {error}
        </p>
      ) : null}

      {pendingFix ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-teal-900">Confirm the detected point</p>
              <p className="mt-0.5 font-mono text-[11px] text-teal-900/80">
                {pendingFix.latitude.toFixed(5)}, {pendingFix.longitude.toFixed(5)}
              </p>
              <p className="mt-1 text-[10.5px] leading-4 text-teal-800/80">
                {pendingFix.accuracy !== null
                  ? `The device reports an accuracy radius of about ${Math.round(
                      pendingFix.accuracy,
                    )} m. `
                  : "The device did not report an accuracy radius. "}
                If the pin is not on your workplace, search for the address instead.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setPendingFix(null)}>
                Cancel
              </Button>
              <Button type="button" variant="navy" size="sm" onClick={confirmFix}>
                <MapPin className="h-3.5 w-3.5" /> Use this location
              </Button>
            </div>
          </div>
          <LocationMap
            latitude={pendingFix.latitude}
            longitude={pendingFix.longitude}
            name="Detected location"
            className="mt-3 h-[160px]"
          />
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
          {results.map((result) => (
            <button
              key={`${result.id}-${result.latitude}-${result.longitude}`}
              type="button"
              onClick={() => {
                onSelect({
                  name: result.label,
                  latitude: result.latitude,
                  longitude: result.longitude,
                  timezone: result.timezone,
                  country: result.country,
                });
                setResults([]);
                // A short name, not the full "City, State, Country" label: searching
                // the whole label again returns no matches.
                setQuery(result.label.split(",")[0].trim());
                setSearched(false);
                setError(null);
              }}
              className="flex w-full items-start gap-2.5 border-b border-line/70 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-mist-100"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-navy-900">{result.label}</span>
                <span className="block text-[10.5px] text-ink-muted">
                  {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                  {result.timezone ? ` · ${result.timezone}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : searched && !searching && !error ? (
        <p className="text-[11px] text-ink-muted">No places matched that search.</p>
      ) : null}
    </div>
  );
}
