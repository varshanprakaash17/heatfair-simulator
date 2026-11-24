"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "./api";
import type { Bootstrap, Policy, Scenario, SelectedLocation } from "./types";

type WorkspaceValue = {
  bootstrap: Bootstrap | null;
  policies: Policy[];
  scenarios: Scenario[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setPolicies: (policies: Policy[]) => void;
  setScenarios: (scenarios: Scenario[]) => void;
  location: SelectedLocation | null;
  setLocation: (location: SelectedLocation | null) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const LAST_SIMULATION_KEY = "heatfair:last-simulation";
const LOCATION_KEY = "heatfair:location";

// Concurrent callers (layout mount, Strict Mode, several pages) share one
// request; a later explicit refresh still reaches the API again.
let bootstrapInFlight: Promise<Bootstrap> | null = null;

function loadBootstrap(): Promise<Bootstrap> {
  if (!bootstrapInFlight) {
    bootstrapInFlight = api.bootstrap().finally(() => {
      window.setTimeout(() => {
        bootstrapInFlight = null;
      }, 0);
    });
  }
  return bootstrapInFlight;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocationState] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCATION_KEY);
      if (stored) setLocationState(JSON.parse(stored) as SelectedLocation);
    } catch {
      // Ignore malformed local storage; the user can pick a location again.
    }
  }, []);

  const setLocation = useCallback((next: SelectedLocation | null) => {
    setLocationState(next);
    if (next) window.localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(LOCATION_KEY);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadBootstrap();
      setBootstrap(data);
      setPolicies(data.policies);
      setScenarios(data.scenarios);

      // A first visit has no stored workplace yet. Reuse the location of the
      // latest stored simulation so Live weather opens on real data instead
      // of an empty picker.
      const stored = window.localStorage.getItem(LOCATION_KEY);
      const weatherLocation = data.latest_simulation?.configuration?.weather?.location as
        | Partial<SelectedLocation>
        | undefined;
      if (
        !stored &&
        weatherLocation &&
        typeof weatherLocation.name === "string" &&
        typeof weatherLocation.latitude === "number" &&
        typeof weatherLocation.longitude === "number"
      ) {
        setLocationState({
          name: weatherLocation.name,
          latitude: weatherLocation.latitude,
          longitude: weatherLocation.longitude,
          timezone: weatherLocation.timezone ?? null,
          country: weatherLocation.country ?? null,
        });
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to load the HeatFair demo workspace.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      bootstrap,
      policies,
      scenarios,
      loading,
      error,
      refresh,
      setPolicies,
      setScenarios,
      location,
      setLocation,
    }),
    [bootstrap, policies, scenarios, loading, error, refresh, location, setLocation],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function rememberSimulation(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(LAST_SIMULATION_KEY, id);
}

export function recallSimulation(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_SIMULATION_KEY);
}
