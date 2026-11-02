// ── Runtime URLs (resolved at module init, after next/config rewrite) ──────

/**
 * ENROS_URL: root of the Node/Express API on port 4000.
 * All /api/* calls from the browser flow through this proxy.
 * In production set NEXT_PUBLIC_API_URL; dev defaults to /api/config which
 * proxies to http://localhost:4000/api/config via next.config.ts.
 */
const ENROS_URL: string =
  (process.env.NEXT_PUBLIC_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/';

/**
 * OCTOPUS_URL: all Octopus/Solidi connector calls go through the Node proxy
 * (/api/connector → Python FastAPI on port 8000). Set NEXT_PUBLIC_OCTOPUS_API_URL
 * for a deployed origin; dev defaults to /api/connector.
 */
const OCTOPUS_URL: string =
  (process.env.NEXT_PUBLIC_OCTOPUS_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api/connector';

// ── Core request function ─────────────────────────────────────────────────

/**
 * Fetch JSON from a path relative to the given baseUrl, with bearer token.
 * Never logs request bodies (they may contain API keys/secrets).
 */
async function request<T>(path: string, options: {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
} = {}): Promise<T> {
  const { method = 'GET', body, token, headers } = options;
  const hdrs: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token) hdrs.Authorization = `Bearer ${token}`;

  const res = await fetch(`${ENROS_URL}${path}`, {
    method,
    headers: hdrs,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      /* ignore body parse errors */
    }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

// ── Octopus connector (separate backend) API types ─────────────────────────

export interface OctopusConfig {
  ok: boolean;
  backend: string;
  version: string;
}

export interface OctopusProperty {
  is_current: boolean;
  mpan?: string;
  mprn?: string;
}

export interface OctopusAccount {
  properties: OctopusProperty[];
}

export interface OctopusConsumption {
  interval_start: string;
  interval_end: string;
  consumption: number;
}

export interface OctopusTariff {
  valid_from: string;
  valid_to: string;
  unit_rate: number;
  standing_charge: number;
}

export interface OctopusDashboard {
  total_cost: number;
  electricity_consumption: number;
  gas_consumption: number;
  daily_series: { timestamp: string; cost: number }[];
}

export interface OctopusReadiness {
  status:
    | 'daily_only'
    | 'half_hourly_delayed'
    | 'half_hourly_delayed_plus_live';
  mode: string;
  message: string;
}

export interface OctopusDayReport {
  summary: string;
  findings: string[];
  total_claimed_gbp: number;
}

export interface OctopusReading {
  connection_id: string;
  fuel: string;
  mpxn: string;
  serial: string;
  interval_start: string;
  interval_end: string;
  consumption: number;
}

export interface OctopusSyncResult {
  stored_intervals: number;
  from: string;
  to: string;
}

export interface SolisStation {
  id: string;
  name: string;
  url: string;
  active: boolean;
}

export interface SolisInverter {
  sn: string;
  phase_pac: number;
  e_today: number;
  e_total: number;
}

export interface SolisDashboard {
  live_kw: number;
  energy_today_kwh: number;
  energy_total_kwh: number;
}

export interface OctopusHomeSettings {
  section: string;
  data: Record<string, unknown>;
  updated_at: string;
}

export interface OctopusDevice {
  connection_id: string;
  provider: string;
  name: string;
  created_at: string;
}

export interface OctopusDeviceStatus extends Omit<OctopusDevice, 'created_at'> {
  status: 'connected' | 'reconnect_required' | 'paused' | 'error';
  message: string;
}

export interface OctopusConnection {
  connection_id: string;
  account_number: string;
  properties: number;
  electricity_meter_points: number;
  gas_meter_points: number;
}

// ── Octopus API client (all calls go through /api/connector → Python backend) ─

export const OctopusApi = {
  getConfig: (token: string) =>
    request<OctopusConfig>(`${OCTOPUS_URL}`, { token, method: 'GET' }),

  connectOctopus: (
    token: string,
    body: { api_key: string; account_number: string; home_id?: string },
  ) =>
    request<OctopusConnection>(`${OCTOPUS_URL}`, {
      token,
      method: 'POST',
      body,
    }),

  disconnectOctopus: (token: string, connectionId: string) =>
    request<null>(`${OCTOPUS_URL}/v1/connections/${connectionId}`, {
      token,
      method: 'DELETE',
    }),

  getOctopusAccount: (token: string, connectionId: string) =>
    request<OctopusAccount>(`${OCTOPUS_URL}/v1/connections/${connectionId}/account`, {
      token,
    }),

  getOctopusRawAccount: (token: string, connectionId: string) =>
    request<{ [key: string]: unknown }>(
      `${OCTOPUS_URL}/v1/connections/${connectionId}/raw/account`,
      { token },
    ),

  getOctopusConsumption: (
    token: string,
    connectionId: string,
    fuel: 'electricity' | 'gas',
    days = 2,
    groupBy?: 'hour' | 'day' | 'week' | 'month' | 'quarter',
    mpxn?: string,
    serial?: string,
  ) =>
    request<OctopusConsumption[]>(
      `${OCTOPUS_URL}/v1/connections/${connectionId}/consumption?fuel=${fuel}&days=${days}${
        groupBy ? `&group_by=${groupBy}` : ''
      }${mpxn ? `&mpxn=${encodeURIComponent(mpxn)}` : ''}${serial ? `&serial=${encodeURIComponent(serial)}` : ''}`,
      { token },
    ),

  getOctopusTariffs: (token: string, connectionId: string) =>
    request<OctopusTariff[]>(`${OCTOPUS_URL}/v1/connections/${connectionId}/tariffs`, {
      token,
    }),

  getOctopusDashboard: (token: string, connectionId: string) =>
    request<OctopusDashboard>(`${OCTOPUS_URL}/v1/connections/${connectionId}/dashboard`, {
      token,
    }),

  getOctopusReadiness: (token: string, connectionId: string) =>
    request<OctopusReadiness>(`${OCTOPUS_URL}/v1/connections/${connectionId}/readiness`, {
      token,
    }),

  getOctopusYesterday: (
    token: string,
    connectionId: string,
    date?: string,
    includePrompt?: boolean,
  ) =>
    request<OctopusDayReport>(
      `${OCTOPUS_URL}/v1/connections/${connectionId}/yesterday${date ? `?date=${date}` : ''}${
        includePrompt ? '&include_prompt=true' : ''
      }`,
      { token },
    ),

  getOctopusReadings: (token: string, connectionId: string, limit = 500) =>
    request<OctopusReading[]>(
      `${OCTOPUS_URL}/v1/connections/${connectionId}/readings?limit=${limit}`,
      { token },
    ),

  syncOctopus: (
    token: string,
    connectionId: string,
    body: { from?: string; to?: string },
  ) =>
    request<OctopusSyncResult>(
      `${OCTOPUS_URL}/v1/connections/${connectionId}/sync`,
      { token, method: 'POST', body },
    ),

  getSolisStations: (token: string, connectionId: string) =>
    request<SolisStation[]>(`${OCTOPUS_URL}/v1/solis/${connectionId}/stations`, {
      token,
    }),

  getSolisInverters: (token: string, connectionId: string, stationId: string) =>
    request<SolisInverter[]>(
      `${OCTOPUS_URL}/v1/solis/${connectionId}/stations/${stationId}/inverters`,
      { token },
    ),

  getSolisInverterDay: (
    token: string,
    connectionId: string,
    stationId: string,
    sn: string,
    date?: string,
  ) =>
    request<{ timestamp: string; kwh: number }[]>(
      `${OCTOPUS_URL}/v1/solis/${connectionId}/stations/${encodeURIComponent(sn)}/day${date ? `?date=${date}` : ''}`,
      { token },
    ),

  getSolisDashboard: (token: string, connectionId: string) =>
    request<SolisDashboard>(`${OCTOPUS_URL}/v1/solis/${connectionId}/dashboard`, {
      token,
    }),

  getHomeSettings: (token: string, homeId: string) =>
    request<OctopusHomeSettings>(
      `${OCTOPUS_URL}/v1/homes/${encodeURIComponent(homeId)}/settings`,
      { token },
    ),

  setHomeHardware: (token: string, homeId: string, body: unknown) =>
    request<OctopusHomeSettings>(
      `${OCTOPUS_URL}/v1/homes/${encodeURIComponent(homeId)}/settings/hardware`,
      { token, method: 'POST', body },
    ),

  setHomeRatePlan: (token: string, homeId: string, body: unknown) =>
    request<OctopusHomeSettings>(
      `${OCTOPUS_URL}/v1/homes/${encodeURIComponent(homeId)}/settings/rate-plan`,
      { token, method: 'POST', body },
    ),

  setHomePause: (token: string, homeId: string, body: unknown) =>
    request<OctopusHomeSettings>(
      `${OCTOPUS_URL}/v1/homes/${encodeURIComponent(homeId)}/settings/pause`,
      { token, method: 'POST', body },
    ),

  getDevices: (token: string, homeId: string) =>
    request<OctopusDevice[]>(
      `${OCTOPUS_URL}/v1/homes/${encodeURIComponent(homeId)}/devices`,
      { token },
    ),

  refreshDevices: (token: string, homeId: string) =>
    request<OctopusDeviceStatus[]>(
      `${OCTOPUS_URL}/v1/homes/${encodeURIComponent(homeId)}/devices/refresh`,
      { token, method: 'POST' },
    ),

  syncRatePlanFromOctopus: (token: string, connectionId: string) =>
    request<{ success: boolean }>(
      `${OCTOPUS_URL}/v1/rate-plan/sync-from-octopus?connection_id=${connectionId}`,
      { token, method: 'POST' },
    ),

  getDashboard: (token: string, connectionId: string) =>
    request<OctopusDashboard>(`${OCTOPUS_URL}/v1/connections/${connectionId}/dashboard`, {
      token,
    }),

  getConsumption: (token: string, connectionId: string, limit = 500) =>
    request<OctopusReading[]>(
      `${OCTOPUS_URL}/v1/connections/${connectionId}/readings?limit=${limit}`,
      { token },
    ),
};

// ── Backend REST client (EnerOS API — /api/* routes via Node proxy) ───────

export const api = {
  getConfig: (): Promise<ApiConfig> => request<ApiConfig>('/api/config'),

  publicBillCheck: (payload: Record<string, unknown>) =>
    request<PublicBillCheck>('/api/public/bill-check', {
      method: 'POST',
      body: payload,
    }),

  importConsumption: (body: unknown) =>
    request<ImportConsumptionResponse>('/api/consumption/import', {
      method: 'POST',
      body,
    }),

  getConsumption: (siteId: string) =>
    request<ConsumptionResponse>(
      `/api/consumption/${encodeURIComponent(siteId)}`,
    ),

  getBillingStatus: (token: string) =>
    request<{ billing: BillingStatus }>('/api/billing/status', { token }),

  startCheckout: (token: string, body: unknown) =>
    request<CheckoutResult>('/api/billing/checkout', {
      token,
      method: 'POST',
      body,
    }),

  login: (email: string, password: string) =>
    request<{ user: { email: string; name: string }; mode: 'clerk' | 'dev'; token: string }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
    ),

  getMe: (token: string) =>
    request<{ user: { email: string; name: string }; mode: 'clerk' | 'dev' }>(
      '/api/auth/me',
      { token },
    ),

  getWorkspace: (token: string) =>
    request<{ workspace: WorkspaceData; user: { email: string; name: string } }>(
      '/api/workspace',
      { token },
    ),

  addSite: (token: string, payload: unknown) =>
    request<{ site: Site }>('/api/workspace/sites', {
      token,
      method: 'POST',
      body: payload,
    }),

  deleteSite: (token: string, id: string) =>
    request<null>(`/api/workspace/sites/${id}`, {
      token,
      method: 'DELETE',
    }),

  createInvoice: (token: string, payload: unknown) =>
    request<{ invoice: Invoice }>('/api/invoices', {
      token,
      method: 'POST',
      body: payload,
    }),

  recoverInvoice: (token: string, id: string) =>
    request<{ invoice: Invoice }>(`/api/invoices/${id}/recover`, {
      token,
      method: 'POST',
    }),

  advanceAction: (token: string, id: string, body: unknown) =>
    request<{ action: OptimisationAction }>('/api/actions/${id}', {
      token,
      method: 'POST',
      body,
    }),

  getAction: (token: string, id: string) =>
    request<{ action: OptimisationAction }>('/api/actions/${id}', { token }),

  setControlMode: (token: string, mode: ControlMode) =>
    request<{ controlMode: ControlMode }>('/api/workspace/control-mode', {
      token,
      method: 'PUT',
      body: { mode },
    }),

  listUploads: (token: string) =>
    request<{ uploads: UploadedDocument[] }>('/api/uploads', { token }),

  getUploadUrl: (token: string, id: string) =>
    request<{ url: string; expiresIn: number | null }>(
      `/api/uploads/${id}/url`,
      { token },
    ),

  deleteUpload: (token: string, id: string) =>
    request<null>('/api/uploads/${id}', {
      token,
      method: 'DELETE',
    }),

  priceCap: (postcode: string) =>
    request<PriceCapRow[]>(
      `/api/analysis/price-cap?postcode=${encodeURIComponent(postcode)}`,
    ),

  getProfile: (token: string) =>
    request<{ profile: OnboardingProfile }>('/api/account/profile', { token }),

  saveProfile: (
    token: string,
    payload: {
      companyName: string;
      siteCount: number;
      postcode: string;
      regionId?: string;
    },
  ) =>
    request<{ profile: OnboardingProfile }>('/api/account/profile', {
      token,
      method: 'PUT',
      body: payload,
    }),
};

// ── Type exports ───────────────────────────────────────────────────────────

export interface ApiConfig {
  authMode: 'clerk' | 'dev';
  clerkPublishableKey: string | null;
  r2Enabled: boolean;
  llmEnabled: boolean;
  demo: { email: string; password?: string };
}

export interface PublicBillCheck {
  ok: boolean;
  note?: string;
}

export interface ImportConsumptionResponse {
  success: boolean;
}

export interface ConsumptionResponse {
  monthly: MonthlyPoint[];
}

export interface BillingStatus {
  billing: string;
}

export interface CheckoutResult {
  ok: boolean;
  sessionId?: string;
}

export interface OnboardingProfile {
  companyName: string;
  siteCount: number;
  postcode: string;
  regionId?: string;
}

// ── Module marker (kept at bottom so URL constants are evaluated first) ─────

'use client';

export { ENROS_URL, OCTOPUS_URL };
