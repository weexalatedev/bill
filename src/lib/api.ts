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
export interface IntakeResult {
  ok: boolean;
  needsOcr: boolean;
  pages: number;
  textLength: number;
  extractionAvailable: boolean;
  extracted: Record<string, unknown> | null;
  analysis: BillAnalysis | null;
  advice: AuditNarration | null;
  note?: string;
}

export interface ConsumptionQuality {
  format: 'long' | 'wide' | 'unknown';
  rows: number;
  accepted: number;
  rejected: number;
  first: string | null;
  last: string | null;
  periods: number;
  days: number;
  coveragePct: number;
  gaps: number;
  zeroOrNegative: number;
  notes: string[];
}

export interface ConsumptionAnalysis {
  totalKwh: number;
  periods: number;
  days: number;
  avgDailyKwh: number;
  avgKw: number;
  peakKw: number;
  costGbp: number;
  overnightKwh: number;
  overnightAvgKw: number;
  overnightSharePct: number;
  loadShape: { period: number; hour: string; avgKw: number }[];
  anomalies: { date: string; overnightKw: number; vsMedianPct: number }[];
  baseline: {
    baselineDailyKwh: number;
    recentDailyKwh: number;
    savedPct: number;
    savedKwhPerDay: number;
    savedGbpPerMonth: number;
  } | null;
  alerts: { severity: 'info' | 'low' | 'medium' | 'high'; title: string; detail: string }[];
}

export interface ConsumptionResponse {
  series: { from: string; kwh: number }[];
  analysis: ConsumptionAnalysis;
  price: { meanP: number; source: string };
  dataQuality: { consumption: string; coveragePct: number; lastReadingAt?: string };
}

export interface ImportConsumptionResponse {
  imported: number;
  stored: number;
  quality: ConsumptionQuality;
  dataQuality: { consumption: string; coveragePct: number; lastReadingAt: string };
}

export interface BillingStatus {
  planId: string;
  planName: string;
  sites: number;
  pricePerSite: number;
  monthlyGbp: number;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  stripeEnabled: boolean;
  devMode: boolean;
}

export interface CheckoutResult {
  mode: 'stripe' | 'dev';
  url?: string;
  planId: string;
  note?: string;
}

export interface PublicBillFinding {
  code: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  category: string;
  title: string;
  detail: string;
  impactGbp: number;
  recommendation: string;
}

export interface PublicBillCheck {
  score: number;
  recoverableGbp: number;
  findings: PublicBillFinding[];
  effectiveRateP: number | null;
  expectedTotalGbp: number | null;
  region: { id: string; name: string; estimated: boolean } | null;
  capPeriod: { label: string; averageUnitRateP: number; averageStandingChargeP: number };
  note: string;
}

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

export interface DisputeLetterResult {
  subject: string;
  body: string;
  totalClaimedGbp: number;
  findingCount: number;
}

export interface AuditNarration {
  summary: string;
  actions: string[];
  estimatedAnnualSavingGbp?: number;
  source: 'gemini' | 'unavailable';
}

export interface CopilotResponse {
  reply: string;
  suggestions: string[];
  source: 'gemini' | 'unavailable';
  /** Why the model did not answer, when source is 'unavailable'. */
  reason?: string;
  hint?: string;
  geminiEnabled: boolean;
  groundedOn: { sites: number; invoices: number; actions: number; live: boolean };
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

  /** Upload a bill (PDF/text) and run the full Smart Analysis pipeline. */
  analyseFile: (token: string, file: File, siteId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (siteId) form.append('siteId', siteId);
    return request<IntakeResult>('/api/analysis/file', {
      method: 'POST',
      formData: form,
      token,
    });
  },

  /** Public: upload a bill and get audit + advice, no account needed. */
  publicBillCheckFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<IntakeResult>('/api/public/bill-check/file', {
      method: 'POST',
      formData: form,
    });
  },

  /** Import half-hourly consumption CSV for a site. */
  importConsumption: (token: string, siteId: string, csv: string) =>
    request<ImportConsumptionResponse>('/api/consumption/import', {
      method: 'POST',
      body: { siteId, csv },
      token,
    }),

  /** Stored series + analysis for a site. */
  getConsumption: (token: string, siteId: string) =>
    request<ConsumptionResponse>(`/api/consumption/${encodeURIComponent(siteId)}`, { token }),

  /** Current subscription summary. */
  getBilling: (token: string) => request<{ billing: BillingStatus }>('/api/billing/status', { token }),

  /** Start a subscription (Stripe Checkout, or dev-mode activation). */
  billingCheckout: (token: string, planId: string) =>
    request<CheckoutResult>('/api/billing/checkout', {
      method: 'POST',
      body: { planId },
      token,
    }),

  /** Free, no-registration bill check. Public. */
  publicBillCheck: (payload: {
    supplier?: string;
    postcode?: string;
    periodStart?: string;
    periodEnd?: string;
    consumptionKwh?: number;
    unitRateP?: number;
    standingChargeP?: number;
    totalGbp?: number;
    vatGbp?: number;
    businessContract?: boolean;
  }) =>
    request<PublicBillCheck>('/api/public/bill-check', { method: 'POST', body: payload }),

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

  /** Generate a formal dispute letter from an audit result. */
  disputeLetter: (
    token: string,
    payload: BillQuery & { accountNumber?: string; mpan?: string; periodLabel?: string },
  ) =>
    request<{ letter: DisputeLetterResult; analysis: BillAnalysis }>('/api/analysis/dispute-letter', {
      method: 'POST',
      body: payload,
      token,
    }),

  /** Run the engine, then narrate the findings with Gemini (grounded). */
  narrateBill: (token: string, payload: BillQuery) =>
    request<{ analysis: BillAnalysis; narration: AuditNarration }>('/api/analysis/narrate', {
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

  // ── Live UK energy data (public, key-less feeds) ─────────────────────────────

  /** Reachability of the live feeds. Public. */
  getLiveStatus: () => request<LiveStatusResponse>('/api/live/status'),

  /** The live half-hourly price curve for a site, plus a shift plan. Public. */
  getLiveTariff: (params: { region?: string; postcode?: string; hours?: number; kwh?: number }) => {
    const q = new URLSearchParams();
    if (params.region) q.set('region', params.region);
    if (params.postcode) q.set('postcode', params.postcode);
    if (params.hours) q.set('hours', String(params.hours));
    if (params.kwh) q.set('kwh', String(params.kwh));
    return request<LiveTariffResponse>(`/api/live/tariff?${q.toString()}`);
  },

  /** Current + next-24h GB carbon intensity. Public. */
  getLiveCarbon: () => request<LiveCarbonResponse>('/api/live/carbon'),

  // ── Copilot ──────────────────────────────────────────────────────────────────

  /** Grounded Copilot chat. Returns the narrated answer and its provenance. */
  copilotChat: (
    token: string,
    payload: {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      siteId?: string;
    },
  ) => request<CopilotResponse>('/api/copilot/chat', { method: 'POST', body: payload, token }),

  /** Starter prompts for the Copilot. Public. */
  copilotSuggestions: () =>
    request<{ suggestions: string[]; geminiEnabled: boolean }>('/api/copilot/suggestions'),

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
