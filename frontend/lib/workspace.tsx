"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError, type AuthUser } from "./api";
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
  user: AuthUser | null;
  signOut: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const LAST_SIMULATION_KEY = "heatfair:last-simulation";
const LOCATION_KEY = "heatfair:location";

// Concurrent callers share one bootstrap request.
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
  const [user, setUser] = useState<AuthUser | null>(null);

  // Restore the signed-in account from the session cookie.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((session) => {
        if (!cancelled) setUser(session.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the demo workspace (or refresh it on demand).
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadBootstrap();
      if (!document) return;
      setBootstrap(data);
      setPolicies(data.policies);
      setScenarios(data.scenarios);

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

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    await refresh();
  }, [refresh]);

  // Restore saved location on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCATION_KEY);
      if (stored) setLocationState(JSON.parse(stored) as SelectedLocation);
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  const setLocation = useCallback(
    (next: SelectedLocation | null) => {
      setLocationState(next);
      if (next) window.localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(LOCATION_KEY);
    },
    [],
  );

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
      user,
      signOut,
    }),
    [
      bootstrap,
      policies,
      scenarios,
      loading,
      error,
      refresh,
      location,
      setLocation,
      user,
      signOut,
    ],
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
