export type Policy = {
  id: string;
  organization_id: string;
  name: string;
  deadline_pressure: number;
  bonus_dependency: number;
  penalty_severity: number;
  break_compensation: number;
  protected_break_minutes: number;
  flexible_deadlines: boolean;
  paid_breaks: boolean;
  penalise_safety_delays: boolean;
  max_shift_hours: number;
  budget_limit: number;
  created_at: string;
  incentive_pressure_index: number;
};

export type HourlyPoint = {
  index: number;
  hour: number;
  label: string;
  temperature: number;
  humidity: number;
  heat_index: number;
  source: string;
};

export type Scenario = {
  id: string;
  name: string;
  temperature: number;
  humidity: number;
  work_duration: number;
  work_intensity: "light" | "moderate" | "heavy" | "very_heavy" | string;
  shift_start_hour: number;
  hourly_conditions: { hour: number; temperature: number; humidity: number }[] | null;
  location: {
    name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    country?: string | null;
    timezone?: string | null;
  } | null;
  source: string;
  created_at: string;
  hourly_preview: HourlyPoint[];
};

export type Distribution = { bins: number[]; counts: number[]; labels: string[] };

export type Stats = {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  percentiles: Record<string, number>;
  count: number;
};

export type Metrics = {
  exposure_index: number;
  exposure_stats: Stats;
  exposure_distribution: Distribution;
  incentive_pressure_index: number;
  break_accessibility: number;
  break_accessibility_stats: Stats;
  income_retention: number;
  income_retention_stats: Stats;
  income_retention_distribution: Distribution;
  income_loss_per_worker_shift: number;
  total_daily_income_loss: number;
  operational_disruption: number;
  operational_efficiency: number;
  operational_coverage_loss?: number;
  operational_availability_loss?: number;
  unpaid_rest_hours_mean: number;
  workers_exposed_above_60: number;
  workers_with_low_accessibility: number;
  exposure_excess_degree_hours?: number;
  policy_cost: {
    break_compensation_cost: number;
    backfill_cost: number;
    total_cost_per_worker_shift: number;
    budget_limit: number;
    within_budget: boolean;
  };
  population: { workers: number };
  baseline?: {
    label: string;
    note: string;
    exposure_index: number;
    break_accessibility: number;
    income_retention: number;
    operational_disruption: number;
    operational_efficiency: number;
    policy_cost_per_worker_shift: number;
  };
  delta_vs_baseline?: Record<string, number>;
};

export type Recommendation = {
  title: string;
  severity: string;
  metric: string;
  rationale: string;
  action: string;
};

export type HourlySeriesPoint = {
  index: number;
  hour: number;
  label: string;
  heat_index: number;
  excess_heat: number;
  duration_hours: number;
  contribution: number;
};

export type SimulationSummary = {
  id: string;
  organization_id: string;
  policy_id: string;
  scenario_id: string;
  weather_snapshot_id?: string | null;
  status: string;
  model_version: string;
  random_seed: number;
  configuration: Record<string, any>;
  summary: Record<string, any> | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type SimulationListRow = SimulationSummary & {
  label?: string | null;
  policy_name?: string | null;
  scenario_name?: string | null;
  population_size?: number | null;
  exposure_index?: number | null;
  income_retention?: number | null;
  break_accessibility?: number | null;
  operational_efficiency?: number | null;
  weather_location?: string | null;
  weather_type?: string | null;
  has_optimization?: boolean;
};

export type SimulationResults = {
  simulation_id: string;
  status: string;
  model_version: string;
  policy: Record<string, any> | null;
  scenario: Record<string, any> | null;
  metrics: Metrics;
  charts: Record<string, any> | null;
  hourly: HourlySeriesPoint[];
  by_occupation: Record<
    string,
    {
      workers: number;
      exposure_index: number;
      income_retention: number;
      break_accessibility: number;
      operational_disruption: number;
    }
  >;
  workers_summary: Record<string, any>;
  limitations: string[];
  reproducibility: Record<string, any> | null;
  assumptions: Record<string, any>;
  duration_ms: number | null;
  recommendations: Recommendation[];
  optimization?: { frontier_size: number; evaluated: number; feasible: number } | null;
  weather?: WeatherPayload | null;
  created_at: string;
};

export type Candidate = {
  id: string;
  label: string;
  strategy: string;
  policy: {
    deadline_pressure: number;
    bonus_dependency: number;
    penalty_severity: number;
    break_compensation: number;
    protected_break_minutes: number;
    flexible_deadlines: boolean;
    shift_scale: number;
    paid_breaks?: boolean;
    penalise_safety_delays?: boolean;
    max_shift_hours?: number;
  };
  changed_parameters: { parameter: string; before: any; after: any }[];
  objectives: { exposure: number; income_loss: number; disruption: number };
  supporting_metrics: {
    income_retention: number;
    break_accessibility: number;
    operational_efficiency: number;
    cost_per_worker_shift: number;
  };
  feasible: boolean;
  violations: string[];
  is_pareto_optimal: boolean;
  on_frontier: boolean;
  dominated_by: string | null;
  normalised: Record<string, number>;
  recommended?: boolean;
  exposure: number;
  income_loss: number;
  disruption: number;
};

export type ParetoResponse = {
  simulation_id: string;
  generated: number;
  evaluated: number;
  feasible: number;
  constraints: Record<string, number>;
  ranges: Record<string, { min: number; max: number }>;
  candidates: Candidate[];
  frontier: Candidate[];
  notes: string[];
  seed: number;
  objective_labels?: Record<string, string>;
};

export type DashboardPayload = {
  organization: { id: string; name: string; created_at: string };
  counts: {
    synthetic_workers: number;
    saved_workers?: number;
    policies: number;
    scenarios: number;
    simulations: number;
  };
  latest: {
    simulation: SimulationSummary;
    metrics: Metrics;
    hourly: HourlySeriesPoint[];
    recommendations: Recommendation[];
    policy: Record<string, any> | null;
    scenario: Record<string, any> | null;
    weather?: WeatherPayload | null;
    optimization: {
      frontier_size: number;
      evaluated: number;
      feasible: number;
      best_exposure: number | null;
      best_income_loss: number | null;
      best_disruption: number | null;
    } | null;
  } | null;
  recent_simulations: {
    id: string;
    created_at: string;
    status: string;
    label: string;
    policy_name: string | null;
    scenario_name: string | null;
    population_size: number | null;
    exposure_index: number | null;
    income_retention: number | null;
    break_accessibility: number | null;
    operational_efficiency: number | null;
    weather_location?: string | null;
    weather_type?: string | null;
    duration_ms: number | null;
  }[];
  model_version: string | null;
};

export type Bootstrap = {
  is_demo: boolean;
  disclaimer: string;
  organization: { id: string; name: string; created_at: string };
  policies: Policy[];
  scenarios: Scenario[];
  latest_simulation: SimulationSummary | null;
  suggested: {
    policy_id: string | null;
    scenario_id: string | null;
    population_size: number;
    random_seed: number;
  };
};

/* ------------------------------------------------------------------ */
/* Live weather                                                       */
/* ------------------------------------------------------------------ */

export type WeatherCurrent = {
  time: string;
  temperature: number | null;
  humidity: number | null;
  apparent_temperature: number | null;
  is_day: number | null;
  precipitation: number | null;
  weather_code: number | null;
  weather_condition: string;
  cloud_cover: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  wind_gusts: number | null;
  shortwave_radiation: number | null;
};

export type WeatherHourly = {
  index: number;
  time: string;
  date: string;
  hour: number;
  temperature: number | null;
  humidity: number | null;
  apparent_temperature: number | null;
  wind_speed: number | null;
  wind_gusts: number | null;
  shortwave_radiation: number | null;
  cloud_cover: number | null;
  precipitation: number | null;
  weather_code: number | null;
  weather_condition: string;
};

export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  timezone_abbreviation?: string | null;
  utc_offset_seconds?: number | null;
  elevation?: number | null;
};

export type ShiftCondition = {
  hour: number;
  temperature: number;
  humidity: number;
  apparent_temperature: number | null;
  solar_radiation: number | null;
  wind_speed: number | null;
  weather_code: number | null;
};

export type ShiftWindow = {
  date: string;
  start_hour: number;
  end_hour: number;
  hours: number;
  conditions: ShiftCondition[];
  mean_temperature: number | null;
  mean_humidity: number | null;
  weather_type: string;
};

export type WeatherPayload = {
  snapshot_id?: string;
  source?: string;
  provider: string;
  api_url?: string;
  weather_type: string;
  data_note: string;
  retrieved_at: string;
  source_timestamp: string | null;
  forecast_date?: string | null;
  cached?: boolean;
  cache_age_seconds?: number;
  location: WeatherLocation;
  current?: WeatherCurrent;
  hourly?: WeatherHourly[];
  units?: Record<string, string>;
  missing_variables?: string[];
  shift?: ShiftWindow;
  requested_variables?: Record<string, string[]>;
  latitude?: number;
  longitude?: number;
};

export type GeocodeResult = {
  id: number;
  name: string;
  country: string | null;
  country_code: string | null;
  admin1: string | null;
  admin2?: string | null;
  timezone: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  label: string;
};

export type SelectedLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string | null;
  country?: string | null;
};

export type WorkerProfile = {
  id: string;
  label: string | null;
  synthetic_id: string;
  occupation: string;
  hourly_income: number;
  work_intensity: number;
  shift_hours: number;
  workload: number;
  incentive_sensitivity: number;
  break_need: number;
  heat_tolerance: number;
  synthetic: boolean;
  created_at: string;
};

export type WorkerListResponse = {
  total: number;
  synthetic_total: number;
  saved_total: number;
  workers: WorkerProfile[];
};

export type PopulationBreakdown = {
  synthetic: number;
  saved: number;
  total: number;
};
