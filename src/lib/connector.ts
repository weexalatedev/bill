/**
 * Client for the EnerOS device-connector backend (FastAPI service in `backend/`).
 *
 * The browser never talks to the Python service directly: every call goes to the
 * Node API at `/api/connector/*`, which adds the server-side `APP_API_TOKEN` and
 * forwards to the connector. Provider keys never leave the server side.
 *
 * Paths, verbs and payloads here mirror `backend/app/main.py`, `homes.py` and
 * `providers/solis.py` exactly — that backend is the contract, not this file.
 */

const CONNECTOR_URL: string =
  (process.env.NEXT_PUBLIC_CONNECTOR_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api/connector';

/** Error carrying the connector's HTTP status so the UI can branch on it. */
export class ConnectorError extends Error {
  status: number;
  /** Field-level message when the backend returned a 422 detail list. */
  detail: string | null;

  constructor(status: number, message: string, detail: string | null = null) {
    super(message);
    this.name = 'ConnectorError';
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

/** Pull a readable message out of FastAPI's `{detail: ...}` / `{error: ...}` shapes. */
function readError(status: number, payload: unknown): ConnectorError {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string') return new ConnectorError(status, record.error);
    const detail = record.detail;
    if (typeof detail === 'string') return new ConnectorError(status, detail);
    if (Array.isArray(detail)) {
      // Pydantic validation errors: [{loc: [...], msg: "..."}]
      const messages = detail
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            const item = entry as Record<string, unknown>;
            const loc = Array.isArray(item.loc)
              ? item.loc.filter((part) => part !== 'body').join('.')
              : '';
            const msg = typeof item.msg === 'string' ? item.msg.replace(/^Value error, /, '') : '';
            return loc ? `${loc}: ${msg}` : msg;
          }
          return '';
        })
        .filter(Boolean);
      if (messages.length > 0) return new ConnectorError(status, messages.join(' · '), messages[0]);
    }
  }
  return new ConnectorError(status, `Connector request failed (${status})`);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${CONNECTOR_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ConnectorError(0, 'Could not reach the device service. Is it running?');
  }

  if (res.status === 204) return null as T;

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) throw readError(res.status, payload);
  return payload as T;
}

// ── Devices & connections ──────────────────────────────────────────────────

export type Provider = 'octopus' | 'solis';

export type DeviceStatus = 'connected' | 'reconnect_required' | 'paused' | 'error';

export interface Device {
  connection_id: string;
  provider: Provider;
  name: string;
  created_at: string;
}

export interface DeviceStatusRow {
  connection_id: string;
  provider: Provider;
  name: string;
  status: DeviceStatus;
  message: string;
}

export interface OctopusConnection {
  connection_id: string;
  account_number: string;
  properties: number;
  electricity_meter_points: number;
  gas_meter_points: number;
}

export interface SolisConnection {
  connection_id: string;
  stations_total: number | null;
}

// ── Per-home settings (mirror backend/app/homes.py models) ──────────────────

export type BatterySource = 'manual' | 'inverter';

export interface HardwareSettings {
  timezone: string;
  site_location: string;
  solar_setup: string | null;
  solar_panel_kwp: number;
  battery_units: number;
  battery_capacity_kwh_per_unit: number;
  battery_source: BatterySource;
}

/** The backend computes the battery total; the UI must never do its own sum. */
export interface HardwareSettingsOut extends HardwareSettings {
  battery_total_kwh: number;
}

export interface RatePeriod {
  name: string;
  /** `HH:MM` in the home's timezone; `24:00` means end of day. */
  start: string;
  end: string;
  p_per_kwh: number;
}

export type RatePlanSource = 'manual' | 'octopus';

export interface RatePlan {
  supplier: string | null;
  standing_charge_p_per_day: number;
  import_rates: RatePeriod[];
  export_rate_p_per_kwh: number;
  source: RatePlanSource;
}

export interface RatePlanOut extends RatePlan {
  /** Share of the day covered by import periods (the all-day bar). */
  import_coverage_pct: number;
}

export interface PauseSettings {
  home_connections: boolean;
  device_sync: boolean;
  alerts_controls: boolean;
}

export interface PauseOut extends PauseSettings {
  effective: {
    sync_active: boolean;
    alerts_controls_active: boolean;
  };
}

export interface Appliance {
  name: string;
  power_kw: number;
}

export interface HomeSettings {
  hardware: HardwareSettingsOut;
  rate_plan: RatePlanOut;
  pause: PauseOut;
  appliances: { items: Appliance[] };
}

export interface RatePlanSync extends RatePlanOut {
  tariff_code: string;
  note: string;
}

// ── Octopus data (backend/app/main.py + service.py) ─────────────────────────

export type ReadinessStatus = 'ready' | 'limited' | 'no_data';

export type ReadinessMode =
  | 'none'
  | 'daily_only'
  | 'half_hourly_delayed'
  | 'half_hourly_delayed_plus_live';

export interface ReadinessMeterPoint {
  mpxn: string;
  status: ReadinessStatus;
  granularity: 'half_hourly' | 'daily_or_coarser' | 'other' | null;
  coverage_pct: number | null;
  latest_reading_end: string | null;
  data_age_hours: number | null;
}

export interface Readiness {
  status: ReadinessStatus;
  mode: ReadinessMode;
  granularity: string | null;
  coverage_pct: number | null;
  latest_reading_end: string | null;
  data_age_hours: number | null;
  live: { available: boolean; device_id?: string; reason?: string };
  message: string;
  actions: string[];
  meter_points: ReadinessMeterPoint[];
}

export interface DailyPoint {
  date: string;
  kwh: number;
  cost_gbp: number;
}

export interface MeterPointSummary {
  fuel: 'electricity' | 'gas';
  mpxn: string;
  tariff_codes: string[];
  intervals: number;
  total_kwh: number;
  energy_cost_gbp: number;
  standing_charge_gbp: number;
  total_cost_gbp: number;
  avg_unit_price_p_per_kwh: number | null;
  daily: DailyPoint[];
  /** Mean kWh for each hour of the day (24 entries). */
  hourly_profile_kwh: number[];
  peak_half_hour: { start: string; kwh: number } | null;
  baseload_kw: number | null;
  anomalous_days: DailyPoint[];
  notes: string[];
}

export interface MeterPointFailure {
  mpxn: string;
  error: string;
}

export type MeterPoint = MeterPointSummary | MeterPointFailure;

export function isMeterPointFailure(point: MeterPoint): point is MeterPointFailure {
  return 'error' in point;
}

export interface Dashboard {
  account_number: string;
  period: { from: string; to: string; days: number; timezone: string };
  electricity: MeterPoint[];
  gas: MeterPoint[];
  /** REST usage lags about a day; live data is the separate `/live` call. */
  data_mode: 'delayed';
  totals: { kwh: number; cost_gbp: number };
}

export interface TariffEntry {
  fuel: 'electricity' | 'gas';
  mpxn: string;
  tariff_code: string;
  product_code: string;
  register_type: string;
  valid_from: string;
  valid_to: string | null;
  unit_rate_p_per_kwh_now?: number | null;
  standing_charge_p_per_day_now?: number | null;
  upcoming_unit_rates?: { valid_from: string; valid_to: string | null; value_inc_vat: number }[];
}

export type Evidence = 'measured' | 'estimated' | 'guess';

export interface FindingAction {
  text: string;
  effort: string;
  risk: string;
  undo: string;
}

export interface YesterdayFinding {
  evidence: Evidence;
  title: string;
  detail: string;
  actions: FindingAction[];
}

export interface YesterdayWindow {
  start: string;
  end: string;
  excess_kwh: number;
  avg_excess_kw: number;
  extra_cost_gbp: number;
  overnight: boolean;
}

export interface YesterdayWeather {
  available: boolean;
  usable?: boolean;
  reason?: string | null;
  mean_temp_c?: number;
  baseline_mean_temp_c?: number | null;
  heating_degree_days?: number;
  n_days?: number;
  slope_kwh_per_degree_day?: number;
  r2?: number;
  explained_delta_kwh?: number;
}

export interface YesterdayTotals {
  kwh: number;
  cost_gbp: number;
  baseline_kwh: number;
  baseline_cost_gbp: number;
  delta_kwh: number;
  delta_pct: number;
  unexplained_kwh: number;
  quietest_hour: string;
  quietest_hour_kwh: number;
}

export interface YesterdayHour {
  hour: number;
  kwh: number;
  baseline_kwh: number;
  excess_kwh: number;
  unexplained_kwh: number;
}

export interface YesterdayReport {
  status: 'ok' | 'insufficient_data';
  date: string;
  day_type?: 'weekend' | 'weekday';
  message?: string;
  totals?: YesterdayTotals;
  hourly?: YesterdayHour[];
  weather?: YesterdayWeather;
  windows?: YesterdayWindow[];
  findings: YesterdayFinding[];
  data_quality: {
    intervals: number;
    expected: number;
    baseline_days?: number;
    unpriced_intervals?: number;
    pricing_note?: string;
  };
  agent_prompt?: string;
}

export interface LiveTelemetry {
  available: boolean;
  device_id?: string;
  reason?: string;
  readings?: { readAt: string; demand: number; consumption: number }[];
}

export interface ConsumptionInterval {
  consumption: number;
  interval_start: string;
  interval_end: string;
  cost?: { value_inc_vat: number; valid_from: string; valid_to: string | null } | null;
}

export interface SolisInverterSummary {
  sn: string;
  state: 'online' | 'offline' | 'alarm' | 'unknown';
  current_power_w: number | null;
  energy_today_kwh: number | null;
  energy_total_kwh: number | null;
  missing_fields: string[];
}

export interface SolisDashboard {
  status_counts: unknown;
  inverters: SolisInverterSummary[];
  totals: {
    inverter_count: number;
    current_power_kw: number;
    energy_today_kwh: number;
    energy_total_kwh: number;
  };
}

export interface StoredReading {
  connection_id: string;
  fuel: string;
  mpxn: string;
  serial: string;
  interval_start: string;
  interval_end: string;
  consumption: number;
}

// ── API surface ────────────────────────────────────────────────────────────

const home = (homeId: string) => `/v1/homes/${encodeURIComponent(homeId)}`;
const connection = (id: string) => `/v1/connections/${encodeURIComponent(id)}`;
const solis = (id: string) => `/v1/solis/connections/${encodeURIComponent(id)}`;

export const ConnectorApi = {
  // Devices tab ------------------------------------------------------------
  getDevices: (token: string, homeId: string) =>
    request<Device[]>(`${home(homeId)}/devices`, { token }),

  refreshDevices: (token: string, homeId: string) =>
    request<DeviceStatusRow[]>(`${home(homeId)}/devices/refresh`, { token, method: 'POST' }),

  connectOctopus: (
    token: string,
    body: { api_key: string; account_number: string; home_id: string },
  ) => request<OctopusConnection>('/v1/connections', { token, method: 'POST', body }),

  removeOctopus: (token: string, connectionId: string) =>
    request<null>(connection(connectionId), { token, method: 'DELETE' }),

  connectSolis: (
    token: string,
    body: { api_id: string; api_secret: string; home_id: string },
  ) => request<SolisConnection>('/v1/solis/connections', { token, method: 'POST', body }),

  removeSolis: (token: string, connectionId: string) =>
    request<null>(solis(connectionId), { token, method: 'DELETE' }),

  // Settings ---------------------------------------------------------------
  getSettings: (token: string, homeId: string) =>
    request<HomeSettings>(`${home(homeId)}/settings`, { token }),

  putHardware: (token: string, homeId: string, body: HardwareSettings) =>
    request<HardwareSettingsOut>(`${home(homeId)}/settings/hardware`, {
      token,
      method: 'PUT',
      body,
    }),

  putRatePlan: (token: string, homeId: string, body: RatePlan) =>
    request<RatePlanOut>(`${home(homeId)}/settings/rate-plan`, { token, method: 'PUT', body }),

  putPause: (token: string, homeId: string, body: PauseSettings) =>
    request<PauseOut>(`${home(homeId)}/settings/pause`, { token, method: 'PUT', body }),

  putAppliances: (token: string, homeId: string, items: Appliance[]) =>
    request<{ items: Appliance[] }>(`${home(homeId)}/settings/appliances`, {
      token,
      method: 'PUT',
      body: { items },
    }),

  syncRatePlanFromOctopus: (token: string, homeId: string, connectionId: string) =>
    request<RatePlanSync>(
      `${home(homeId)}/rate-plan/sync-from-octopus?connection_id=${encodeURIComponent(connectionId)}`,
      { token, method: 'POST' },
    ),

  // Octopus data -----------------------------------------------------------
  getReadiness: (token: string, connectionId: string) =>
    request<Readiness>(`${connection(connectionId)}/readiness`, { token }),

  getDashboard: (token: string, connectionId: string, days = 30) =>
    request<Dashboard>(`${connection(connectionId)}/dashboard?days=${days}`, { token }),

  getTariffs: (token: string, connectionId: string) =>
    request<TariffEntry[]>(`${connection(connectionId)}/tariffs`, { token }),

  getYesterday: (token: string, connectionId: string, date?: string, includePrompt = false) =>
    request<YesterdayReport>(
      `${connection(connectionId)}/yesterday?${new URLSearchParams({
        ...(date ? { date } : {}),
        ...(includePrompt ? { include_prompt: 'true' } : {}),
      }).toString()}`,
      { token },
    ),

  getLive: (token: string, connectionId: string) =>
    request<LiveTelemetry>(`${connection(connectionId)}/live`, { token }),

  getConsumption: (
    token: string,
    connectionId: string,
    options: {
      fuel?: 'electricity' | 'gas';
      days?: number;
      groupBy?: 'hour' | 'day' | 'week' | 'month' | 'quarter';
    } = {},
  ) => {
    const { fuel = 'electricity', days = 2, groupBy } = options;
    const query = new URLSearchParams({ fuel, days: String(days) });
    if (groupBy) query.set('group_by', groupBy);
    return request<ConsumptionInterval[]>(
      `${connection(connectionId)}/consumption?${query.toString()}`,
      { token },
    );
  },

  getAccount: (token: string, connectionId: string) =>
    request<Record<string, unknown>>(`${connection(connectionId)}/account`, { token }),

  // Solis data -------------------------------------------------------------
  getSolisDashboard: (token: string, connectionId: string) =>
    request<SolisDashboard>(`${solis(connectionId)}/dashboard`, { token }),

  getSolisStations: (token: string, connectionId: string) =>
    request<{ page?: { records?: unknown[]; total?: number } }>(
      `${solis(connectionId)}/stations`,
      { token },
    ),
};

/**
 * Human wording for a device pill. A device that is absent from `/devices`
 * gets the last line — the prompt's "Not connected · connect when ready".
 */
export function devicePill(status: DeviceStatus | 'absent'): {
  label: string;
  /** Monochrome emphasis level: connected is solid, problems are outlined. */
  tone: 'solid' | 'outline' | 'muted' | 'ghost';
} {
  switch (status) {
    case 'connected':
      return { label: 'Connected · live', tone: 'solid' };
    case 'reconnect_required':
      return { label: 'Disconnected · reconnect required', tone: 'outline' };
    case 'paused':
      return { label: 'Paused', tone: 'muted' };
    case 'error':
      return { label: 'Error', tone: 'outline' };
    default:
      return { label: 'Not connected · connect when ready', tone: 'ghost' };
  }
}

/**
 * Guidance for the section-8 error table: 401 from a provider route means
 * reconnect, 423 means the home is paused, 429/502 mean retry later.
 */
export function errorGuidance(error: unknown): {
  paused: boolean;
  reconnect: boolean;
  retryLater: boolean;
  message: string;
} {
  if (error instanceof ConnectorError) {
    switch (error.status) {
      case 401:
        return {
          paused: false,
          reconnect: true,
          retryLater: false,
          message: `${error.message} — the provider rejected these credentials.`,
        };
      case 404:
        return {
          paused: false,
          reconnect: false,
          retryLater: false,
          message: 'Not connected, or no active tariff on this account.',
        };
      case 423:
        return {
          paused: true,
          reconnect: false,
          retryLater: false,
          message: 'Paused — turn device sync back on to load live data.',
        };
      case 429:
        return {
          paused: false,
          reconnect: false,
          retryLater: true,
          message: 'The provider is rate-limiting us. Try again shortly.',
        };
      case 502:
        return {
          paused: false,
          reconnect: false,
          retryLater: true,
          message: `${error.message} — retry in a moment.`,
        };
      default:
        return { paused: false, reconnect: false, retryLater: false, message: error.message };
    }
  }
  return {
    paused: false,
    reconnect: false,
    retryLater: false,
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
}


