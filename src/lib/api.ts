// REST client for the EnerOS API. Requests use the same origin by default and
// can target a separate API host through VITE_API_URL. Each call takes an
// optional bearer token, which the store obtains from the active auth provider.
import type {
  Account,
  AnalysisFinding,
  AssetSlice,
  BillAnalysis,
  ControlMode,
  Invoice,
  MonthlyPoint,
  OptimisationAction,
  Plan,
  Site,
  SiteRisk,
} from '../types';

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface ApiConfig {
  authMode: 'clerk' | 'dev';
  clerkPublishableKey: string | null;
  r2Enabled: boolean;
  /** True when LLM bill extraction is configured on the API. */
  llmEnabled: boolean;
  demo: { email: string; password?: string };
}

/** One row of the Ofgem cap table. */
export interface CapRegion {
  id: string;
  name: string;
  rank: number;
  unitRateP: number;
  standingChargeP: number;
  prepaymentUnitRateP: number;
  standardCreditUnitRateP: number;
}

export interface CapPeriod {
  id: string;
  label: string;
  start: string;
  end: string;
  averageUnitRateP: number;
  averageStandingChargeP: number;
  changePct: number;
  electricityVatPct: number;
  source: string;
}

export interface OnboardingProfile {
  companyName: string;
  siteCount: number;
  postcode: string;
  regionId: string;
  onboarded: boolean;
}

/** Payload accepted by `POST /api/analysis/bill`. */
export interface BillQuery {
  siteId?: string;
  supplier?: string;
  periodStart?: string;
  periodEnd?: string;
  consumptionKwh?: number;
  unitRateP?: number;
  standingChargeP?: number;
  totalGbp?: number;
  vatGbp?: number;
  paymentMethod?: 'direct-debit' | 'standard-credit' | 'prepayment';
  nightShare?: number;
  businessContract?: boolean;
  includeWeather?: boolean;
}

export interface WeatherSummary {
  meanTempC: number | null;
  degreeDays: number | null;
  normalised: boolean;
  note?: string;
}

export interface PortfolioRisk {
  risks: SiteRisk[];
  totals: {
    analysed: number;
    withFindings: number;
    recoverableGbp: number;
  };
  capPeriod: string;
}

export type { AnalysisFinding, BillAnalysis, SiteRisk };

/**
 * The writable subset of a site — the server mints `id` and validates the same
 * shape, so this stays a structural mirror of `Site` minus the read-only bits.
 */
export interface SiteDraft {
  name: string;
  city: string;
  region: string;
  type: Site['type'];
  annualSpend: number;
  monthActual: number;
  monthExpected?: number;
  meterType: Site['meterType'];
  status?: Site['status'];
  postcode?: string;
  loads: string[];
  lastSynced?: string;
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type TokenGetter = () => Promise<string | null>;

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

  devLogin: (email: string, password: string) =>
    request<{ token: string; user: { email: string; name: string }; mode: 'dev' }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
    ),

  getMe: (token: string) =>
    request<{ user: { email: string; name: string }; mode: 'clerk' | 'dev' }>('/api/auth/me', {
      token,
    }),

  getWorkspace: (token: string) =>
    request<{ workspace: WorkspaceData; user: { email: string; name: string } }>('/api/workspace', {
      token,
    }),

  createSite: (token: string, payload: SiteDraft) =>
    request<{ site: Site }>('/api/workspace/sites', { method: 'POST', body: payload, token }),

  updateSite: (token: string, id: string, payload: Partial<SiteDraft>) =>
    request<{ site: Site }>(`/api/workspace/sites/${id}`, {
      method: 'PATCH',
      body: payload,
      token,
    }),

  deleteSite: (token: string, id: string) =>
    request<null>(`/api/workspace/sites/${id}`, { method: 'DELETE', token }),

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

  listUploads: (token: string) => request<{ uploads: UploadedDocument[] }>('/api/uploads', { token }),

  uploadDocument: (token: string, file: File, invoiceId?: string) => {
    const form = new FormData();
    form.append('file', file);
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

  // ── Smart Analysis ───────────────────────────────────────────────────────────

  /** The published Ofgem cap table. Public — no token needed. */
  getPriceCap: () =>
    request<{ period: CapPeriod; regions: CapRegion[]; extractionAvailable: boolean }>(
      '/api/analysis/price-cap',
    ),

  /** Postcode → cap region. Public, used live on the welcome screen. */
  getRegion: (postcode: string) =>
    request<{ region: CapRegion | null; estimated?: boolean; note?: string }>(
      `/api/analysis/region?postcode=${encodeURIComponent(postcode)}`,
    ),

  /** Run the rules engine over a bill. Nothing is persisted. */
  analyseBill: (token: string, payload: BillQuery) =>
    request<{ analysis: BillAnalysis; weather: WeatherSummary | null }>('/api/analysis/bill', {
      method: 'POST',
      body: payload,
      token,
    }),

  /** Paste raw bill text and have the LLM extract + analyse it. */
  extractBill: (token: string, text: string) =>
    request<{ analysis: BillAnalysis; extracted: Record<string, unknown> }>(
      '/api/analysis/extract',
      { method: 'POST', body: { text }, token },
    ),

  /** Re-run the engine across every stored invoice. */
  getPortfolioRisk: (token: string) =>
    request<PortfolioRisk>('/api/analysis/portfolio', { token }),

  // ── Onboarding profile ───────────────────────────────────────────────────────

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
      method: 'PUT',
      body: payload,
      token,
    }),
};
