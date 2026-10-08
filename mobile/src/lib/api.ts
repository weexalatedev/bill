// REST client for the EnerOS API (React Native / Expo). Base URL comes from
// EXPO_PUBLIC_API_URL (defaults to the local API). The store attaches a bearer
// token obtained from Clerk.
import type {
  Account,
  AssetSlice,
  ControlMode,
  Invoice,
  MonthlyPoint,
  OptimisationAction,
  Plan,
  Site,
} from '../types';

export const API_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:4000';

export interface ApiConfig {
  clerkPublishableKey: string;
  r2Enabled: boolean;
}

export interface UploadedDocument {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  url: string | null;
  invoiceId?: string;
  createdAt: string;
}

export interface WorkspaceData {
  account: Account;
  sites: Site[];
  invoices: Invoice[];
  actions: OptimisationAction[];
  monthly: MonthlyPoint[];
  assetMix: AssetSlice[];
  plans: Plan[];
  suppliers: string[];
  annualSpendTotal: number;
  controlMode: ControlMode;
  uploads: UploadedDocument[];
}

/** React Native file descriptor accepted by FormData. */
export interface NativeFile {
  uri: string;
  name: string;
  type: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  formData?: FormData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, formData } = options;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const message = text.trim().slice(0, 300);
      throw new ApiError(
        res.status,
        res.ok ? 'The API returned an invalid response.' : message || `Request failed (${res.status})`,
      );
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  getConfig: (): Promise<ApiConfig> => request<ApiConfig>('/api/config'),

  getMe: (token: string) =>
    request<{ user: { email: string; name: string } }>('/api/auth/me', {
      token,
    }),

  getWorkspace: (token: string) =>
    request<{ workspace: WorkspaceData; user: { email: string; name: string } }>('/api/workspace', {
      token,
    }),

  createInvoice: (token: string, payload: Record<string, unknown>) =>
    request<{ invoice: Invoice }>('/api/invoices', { method: 'POST', body: payload, token }),

  recoverInvoice: (token: string, id: string) =>
    request<{ invoice: Invoice }>(`/api/invoices/${id}/recover`, { method: 'POST', token }),

  advanceAction: (token: string, id: string) =>
    request<{ action: OptimisationAction }>(`/api/actions/${id}/advance`, {
      method: 'POST',
      token,
    }),

  setActionStatus: (token: string, id: string, status: string) =>
    request<{ action: OptimisationAction }>(`/api/actions/${id}`, {
      method: 'PATCH',
      body: { status },
      token,
    }),

  setControlMode: (token: string, mode: ControlMode) =>
    request<{ controlMode: ControlMode }>('/api/workspace/control-mode', {
      method: 'PUT',
      body: { mode },
      token,
    }),

  listUploads: (token: string) =>
    request<{ uploads: UploadedDocument[] }>('/api/uploads', { token }),

  uploadDocument: (token: string, file: NativeFile, invoiceId?: string) => {
    const form = new FormData();
    // React Native accepts { uri, name, type } for multipart uploads.
    form.append('file', file as unknown as Blob);
    if (invoiceId) form.append('invoiceId', invoiceId);
    return request<{ upload: UploadedDocument }>('/api/uploads', {
      method: 'POST',
      formData: form,
      token,
    });
  },

  documentUrl: (token: string, id: string) =>
    request<{ url: string; expiresIn: number | null }>(`/api/uploads/${id}/url`, { token }),

  deleteUpload: (token: string, id: string) =>
    request<null>(`/api/uploads/${id}`, { method: 'DELETE', token }),

  // ── Live UK energy data (public, key-less feeds) ─────────────────────────────

  /** Reachability of the live Octopus + NESO feeds. Public. */
  getLiveStatus: () => request<LiveStatusResponse>('/api/live/status'),

  /** The live half-hourly price curve for a site, plus a shift plan. Public. */
  getLiveTariff: (params: { region?: string; postcode?: string; hours?: number; kwh?: number }) => {
    const parts: string[] = [];
    if (params.region) parts.push(`region=${encodeURIComponent(params.region)}`);
    if (params.postcode) parts.push(`postcode=${encodeURIComponent(params.postcode)}`);
    if (params.hours) parts.push(`hours=${params.hours}`);
    if (params.kwh) parts.push(`kwh=${params.kwh}`);
    return request<LiveTariffResponse>(`/api/live/tariff?${parts.join('&')}`);
  },

  /** Current + next-24h GB carbon intensity. Public. */
  getLiveCarbon: () => request<LiveCarbonResponse>('/api/live/carbon'),

};

// ── Live UK energy data ────────────────────────────────────────────────────────

/** One half-hourly unit rate from the live Agile Octopus curve. */
export interface LiveRate {
  validFrom: string;
  validTo: string;
  unitRateP: number;
  unitRateExcVatP: number;
}

export interface LivePriceWindow {
  from: string;
  to: string;
  periods: number;
  hours: number;
  avgUnitRateP: number;
  minUnitRateP: number;
  maxUnitRateP: number;
}

export interface LivePriceStats {
  count: number;
  minUnitRateP: number;
  maxUnitRateP: number;
  meanUnitRateP: number;
  medianUnitRateP: number;
  p25UnitRateP: number;
  p75UnitRateP: number;
  cheapShare: number;
}

export interface LiveTariffSnapshot {
  region: string;
  regionName: string;
  productCode: string;
  tariffCode: string;
  standingChargeP: number;
  source: string;
  fetchedAt: string;
  cached: boolean;
  rates: LiveRate[];
  stats: LivePriceStats;
  current: LiveRate | null;
  cheapest: LivePriceWindow[];
  priciest: LivePriceWindow[];
  windowStart: string | null;
  windowEnd: string | null;
}

export interface LiveShiftPlan {
  kwh: number;
  durationHours: number;
  from: LivePriceWindow | null;
  to: LivePriceWindow | null;
  savingGbpPerCycle: number;
  savingGbpPerMonth: number;
  gapP: number;
}

export interface LiveCarbonPoint {
  from: string;
  to: string;
  forecast: number | null;
  actual: number | null;
  index: string;
}

export interface LiveTariffResponse {
  tariff: LiveTariffSnapshot;
  shift: LiveShiftPlan;
  regionVia: 'explicit' | 'postcode' | 'default';
}

export interface LiveCarbonResponse {
  current: LiveCarbonPoint | null;
  forecast: LiveCarbonPoint[];
  source: string;
  fetchedAt: string;
}

export interface LiveStatusResponse {
  ok: boolean;
  feeds: {
    octopus: { ok: boolean; region: string | null; source: string };
    carbon: { ok: boolean; source: string };
  };
  regions: string[];
  checkedAt: string;
}

