"use client";

import { API_URL } from "./utils";
import type {
  Bootstrap,
  DashboardPayload,
  GeocodeResult,
  ParetoResponse,
  Policy,
  Scenario,
  SimulationListRow,
  SimulationResults,
  SimulationSummary,
  WeatherPayload,
  WorkerListResponse,
  WorkerProfile,
} from "./types";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
};

export type AuthMembership = {
  organization_id: string;
  organization_name: string;
  role: string;
};

export type AuthSession = {
  user: AuthUser;
  memberships: AuthMembership[];
};

const API_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};

  if (init?.body != null) {
    headers["Content-Type"] = "application/json";
  }
  if (init?.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      cache: "no-store",
      // The login session is an HTTP-only cookie set by the API origin.
      credentials: "include",
      headers,
      signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
    throw new ApiError(
      timedOut
        ? "The HeatFair engine did not respond in time. Try again in a moment."
        : "Could not reach the HeatFair API. The backend is not running, or this deployment is not configured with its address (HEATFAIR_API_URL).",
      0,
      cause,
    );
  }

  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    const message =
      typeof detail === "object" && detail && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string; database: string; version: string }>("/health"),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  me: () => request<AuthSession>("/auth/me"),

  createAccount: (payload: {
    organization_id: string;
    email: string;
    name?: string;
  }) =>
    request<AuthSession>("/auth/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bootstrap: () => request<Bootstrap>("/demo/bootstrap"),

  dashboard: (organizationId?: string) =>
    request<DashboardPayload>(
      `/dashboard${organizationId ? `?organization_id=${organizationId}` : ""}`,
    ),

  policies: (organizationId: string) =>
    request<Policy[]>(`/policies?organization_id=${organizationId}`),

  createPolicy: (payload: Record<string, unknown>) =>
    request<Policy>("/policies", { method: "POST", body: JSON.stringify(payload) }),

  updatePolicy: (id: string, payload: Record<string, unknown>) =>
    request<Policy>(`/policies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  deletePolicy: (id: string) => request<void>(`/policies/${id}`, { method: "DELETE" }),

  scenarios: () => request<Scenario[]>("/scenarios"),

  createScenario: (payload: Record<string, unknown>) =>
    request<Scenario>("/scenarios", { method: "POST", body: JSON.stringify(payload) }),

  scenarioHourly: (id: string) =>
    request<{ hourly: Scenario["hourly_preview"] }>(`/scenarios/${id}/hourly`),

  generateWorkers: (payload: { organization_id: string; size: number; seed: number }) =>
    request<{ summary: Record<string, any>; profiles: Record<string, any>[] }>(
      "/workers/generate",
      { method: "POST", body: JSON.stringify({ ...payload, persist: true }) },
    ),

  workers: (organizationId: string, options?: { includeSynthetic?: boolean }) =>
    request<WorkerListResponse>(
      `/workers?organization_id=${organizationId}&include_synthetic=${
        options?.includeSynthetic ?? true
      }`,
    ),

  createWorker: (payload: Record<string, unknown>) =>
    request<WorkerProfile>("/workers", { method: "POST", body: JSON.stringify(payload) }),

  updateWorker: (id: string, organizationId: string, payload: Record<string, unknown>) =>
    request<WorkerProfile>(`/workers/${id}?organization_id=${organizationId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteWorker: (id: string, organizationId: string) =>
    request<void>(`/workers/${id}?organization_id=${organizationId}`, { method: "DELETE" }),

  runSimulation: (payload: {
    organization_id: string;
    policy_id: string;
    scenario_id?: string;
    latitude?: number;
    longitude?: number;
    location_name?: string;
    work_start_hour?: number;
    work_end_hour?: number;
    population_size: number;
    random_seed: number;
    simulation_duration_days?: number;
    include_saved_workers?: boolean;
    label?: string;
  }) =>
    request<{ simulation: SimulationSummary; results: SimulationResults }>(
      "/simulations/run",
      { method: "POST", body: JSON.stringify(payload) },
    ),

  simulations: (organizationId: string, limit = 20) =>
    request<SimulationListRow[]>(
      `/simulations?organization_id=${organizationId}&limit=${limit}`,
    ),

  simulation: (id: string) =>
    request<SimulationSummary & { has_optimization?: boolean }>(`/simulations/${id}`),

  results: (id: string) => request<SimulationResults>(`/simulations/${id}/results`),

  optimize: (
    id: string,
    payload: { candidate_count: number; seed: number; population_size?: number },
  ) =>
    request<ParetoResponse>(`/simulations/${id}/optimize`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  pareto: (id: string) => request<ParetoResponse>(`/simulations/${id}/pareto`),

  applyCandidate: (
    id: string,
    payload: { candidate_id: string; run_simulation: boolean; population_size: number },
  ) =>
    request<{
      policy: Policy;
      simulation: SimulationSummary | null;
      results: SimulationResults | null;
    }>(`/simulations/${id}/apply`, { method: "POST", body: JSON.stringify(payload) }),

  reportUrl: (id: string) => `${API_URL}/api/v1/simulations/${id}/report`,

  reports: (simulationId?: string) =>
    request<
      { id: string; simulation_id: string; report_url: string; title: string; created_at: string }[]
    >(`/reports${simulationId ? `?simulation_id=${simulationId}` : ""}`),

  geocode: (query: string) =>
    request<{ query: string; source: string; results: GeocodeResult[] }>(
      `/weather/geocode?query=${encodeURIComponent(query)}`,
    ),

  weatherForecast: (
    latitude: number,
    longitude: number,
    options?: {
      name?: string;
      startHour?: number;
      endHour?: number;
      force?: boolean;
      date?: string;
    },
  ) => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_hour: String(options?.startHour ?? 6),
      end_hour: String(options?.endHour ?? 18),
    });
    if (options?.name) params.set("name", options.name);
    if (options?.force) params.set("force", "true");
    if (options?.date) params.set("date", options.date);
    return request<WeatherPayload>(`/weather/forecast?${params.toString()}`);
  },

  currentWeather: (latitude: number, longitude: number, name?: string, force = false) => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      force: String(force),
    });
    if (name) params.set("name", name);
    return request<WeatherPayload>(`/weather/current?${params.toString()}`);
  },

  searchLocations: (query: string) => api.geocode(query),

  weather: (latitude: number, longitude: number, name?: string) =>
    request<WeatherPayload & { hourly: WeatherPayload["hourly"] }>(
      `/weather?latitude=${latitude}&longitude=${longitude}${name ? `&name=${encodeURIComponent(name)}` : ""}`,
    ),
};
