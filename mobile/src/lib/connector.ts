/**
 * Device-connector client for the mobile app (mirrors src/lib/connector.ts on web).
 *
 * Calls go to the Node API at `${API_URL}/api/connector/*`, which adds the
 * server-side APP_API_TOKEN and forwards to the Python connector. Provider keys
 * never touch the device.
 */
import { API_URL } from './api';

const CONNECTOR_URL = `${API_URL}/api/connector`;

export class ConnectorError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ConnectorError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

function readError(status: number, payload: unknown): ConnectorError {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string') return new ConnectorError(status, record.error);
    const detail = record.detail;
    if (typeof detail === 'string') return new ConnectorError(status, detail);
    if (Array.isArray(detail)) {
      const messages = detail
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            const item = entry as Record<string, unknown>;
            return typeof item.msg === 'string' ? item.msg.replace(/^Value error, /, '') : '';
          }
          return '';
        })
        .filter(Boolean);
      if (messages.length > 0) return new ConnectorError(status, messages.join(' · '));
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
    throw new ConnectorError(0, 'Could not reach the device service. Check your connection.');
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

export interface HardwareSettings {
  timezone: string;
  site_location: string;
  solar_setup: string | null;
  solar_panel_kwp: number;
  battery_units: number;
  battery_capacity_kwh_per_unit: number;
  battery_source: 'manual' | 'inverter';
}

export interface HardwareSettingsOut extends HardwareSettings {
  battery_total_kwh: number;
}

export interface RatePeriod {
  name: string;
  start: string;
  end: string;
  p_per_kwh: number;
}

export interface RatePlan {
  supplier: string | null;
  standing_charge_p_per_day: number;
  import_rates: RatePeriod[];
  export_rate_p_per_kwh: number;
  source: 'manual' | 'octopus';
}

export interface RatePlanOut extends RatePlan {
  import_coverage_pct: number;
}

export interface PauseSettings {
  home_connections: boolean;
  device_sync: boolean;
  alerts_controls: boolean;
}

export interface PauseOut extends PauseSettings {
  effective: { sync_active: boolean; alerts_controls_active: boolean };
}

export interface HomeSettings {
  hardware: HardwareSettingsOut;
  rate_plan: RatePlanOut;
  pause: PauseOut;
  appliances: { items: { name: string; power_kw: number }[] };
}

export interface Readiness {
  status: 'ready' | 'limited' | 'no_data';
  mode: string;
  message: string;
  actions: string[];
  live: { available: boolean; reason?: string };
}

const home = (homeId: string) => `/v1/homes/${encodeURIComponent(homeId)}`;

export const ConnectorApi = {
  getDevices: (token: string, homeId: string) =>
    request<Device[]>(`${home(homeId)}/devices`, { token }),

  refreshDevices: (token: string, homeId: string) =>
    request<DeviceStatusRow[]>(`${home(homeId)}/devices/refresh`, { token, method: 'POST' }),

  connectOctopus: (token: string, body: { api_key: string; account_number: string; home_id: string }) =>
    request<{ connection_id: string }>('/v1/connections', { token, method: 'POST', body }),

  removeOctopus: (token: string, connectionId: string) =>
    request<null>(`/v1/connections/${encodeURIComponent(connectionId)}`, { token, method: 'DELETE' }),

  connectSolis: (token: string, body: { api_id: string; api_secret: string; home_id: string }) =>
    request<{ connection_id: string; stations_total: number | null }>('/v1/solis/connections', {
      token,
      method: 'POST',
      body,
    }),

  removeSolis: (token: string, connectionId: string) =>
    request<null>(`/v1/solis/connections/${encodeURIComponent(connectionId)}`, {
      token,
      method: 'DELETE',
    }),

  getSettings: (token: string, homeId: string) =>
    request<HomeSettings>(`${home(homeId)}/settings`, { token }),

  putHardware: (token: string, homeId: string, body: HardwareSettings) =>
    request<HardwareSettingsOut>(`${home(homeId)}/settings/hardware`, { token, method: 'PUT', body }),

  putRatePlan: (token: string, homeId: string, body: RatePlan) =>
    request<RatePlanOut>(`${home(homeId)}/settings/rate-plan`, { token, method: 'PUT', body }),

  putPause: (token: string, homeId: string, body: PauseSettings) =>
    request<PauseOut>(`${home(homeId)}/settings/pause`, { token, method: 'PUT', body }),

  syncRatePlanFromOctopus: (token: string, homeId: string, connectionId: string) =>
    request<RatePlanOut & { tariff_code: string; note: string }>(
      `${home(homeId)}/rate-plan/sync-from-octopus?connection_id=${encodeURIComponent(connectionId)}`,
      { token, method: 'POST' },
    ),

  getReadiness: (token: string, connectionId: string) =>
    request<Readiness>(`/v1/connections/${encodeURIComponent(connectionId)}/readiness`, { token }),
};

/** Guidance for the connector's error codes, mirroring the brief's table. */
export function errorGuidance(error: unknown): { paused: boolean; reconnect: boolean; message: string } {
  if (error instanceof ConnectorError) {
    if (error.status === 423) {
      return { paused: true, reconnect: false, message: 'Paused — turn device sync back on.' };
    }
    if (error.status === 401) {
      return { paused: false, reconnect: true, message: `${error.message} Reconnect this device.` };
    }
    if (error.status === 404) {
      return { paused: false, reconnect: false, message: 'Not connected, or no active tariff.' };
    }
    return { paused: false, reconnect: false, message: error.message };
  }
  return {
    paused: false,
    reconnect: false,
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
}
