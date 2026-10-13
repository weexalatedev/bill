// EnerOS domain model — see the business plan:
// Layer 1 Energy Data OS → Layer 2 AI Energy Brain → Modules A–E.

export type MeterType = 'Smart' | 'Advanced' | 'AMR' | 'Half-hourly';

export type SiteStatus = 'Optimal' | 'Watch' | 'Anomaly';

export type SiteType =
  | 'Restaurant'
  | 'Café'
  | 'Bakery'
  | 'Pub'
  | 'Hotel'
  | 'Food Production'
  | 'Retail';

export interface Site {
  id: string;
  name: string;
  city: string;
  region: string;
  type: SiteType;
  /** Annual energy spend in GBP. */
  annualSpend: number;
  /** Monthly spend for the current period (GBP). */
  monthActual: number;
  /** Expected spend for the current period before optimisation (GBP). */
  monthExpected: number;
  meterType: MeterType;
  status: SiteStatus;
  /** Postcode, used to estimate the site's Ofgem price-cap region. */
  postcode?: string;
  /** Fixed-contract window, ISO `YYYY-MM-DD`. Drives the rate-creep check. */
  contractStart?: string;
  contractEnd?: string;
  /** Controllable loads discovered on site (Module D / E). */
  loads: string[];
  /** Last time the AI Energy Brain refreshed this site's model. */
  lastSynced: string;
}

export type BillStatus = 'Clean' | 'Flagged' | 'Recovered';

export type BillIssueType =
  | 'Incorrect charge'
  | 'Abnormal consumption'
  | 'Tariff discrepancy'
  | 'Standing charge'
  | 'Meter issue'
  | 'Unexpected change';

export interface BillIssue {
  type: BillIssueType;
  detail: string;
  /** GBP impact. Negative = you were overcharged. Positive = undercharged. */
  impact: number;
}

export interface Invoice {
  id: string;
  siteId: string;
  supplier: string;
  /** Billing period, e.g. "Feb 2026". */
  period: string;
  /** Resolved billing dates, ISO `YYYY-MM-DD`. Optional, but they are what the history checks need. */
  periodStart?: string;
  periodEnd?: string;
  /** True when the reading behind the bill was estimated, not actual. */
  isEstimate?: boolean;
  consumptionKwh: number;
  /** Unit rate in pence per kWh. */
  unitRateP: number;
  /** Standing charge in pence per day. */
  standingChargeP: number;
  /** Invoice total in GBP. */
  total: number;
  status: BillStatus;
  issues: BillIssue[];
}

export type ActionStatus = 'Recommended' | 'Approved' | 'Automated';

/** Progressive trust model (Risk 3): Recommend → Approve → Automate. */
export type ControlMode = 'Recommend' | 'Approve' | 'Automate';

export interface OptimisationAction {
  id: string;
  title: string;
  asset: string;
  siteId: string;
  fromSchedule: string;
  toSchedule: string;
  /** Estimated monthly saving in GBP. */
  monthlySaving: number;
  /** Model confidence, 0–1. */
  confidence: number;
  status: ActionStatus;
  rationale: string;
}

export interface Plan {
  id: 'starter' | 'optimise' | 'autonomous';
  name: string;
  pricePerSite: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

export interface MonthlyPoint {
  month: string;
  actual: number;
  expected: number;
}

export interface AssetSlice {
  asset: string;
  kwh: number;
  spend: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Optional follow-up suggestion chips. */
  suggestions?: string[];
}

export interface Account {
  name: string;
  planId: Plan['id'];
  sites: number;
  contractStart: string;
  performanceFeePct: number;
  flexibilitySharePct: number;
}

// ── Smart Analysis ─────────────────────────────────────────────────────────────

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high';

/** Which part of the bill the finding is about — drives the UI grouping. */
export type FindingCategory = 'pricing' | 'metering' | 'consumption' | 'opportunity';

/** Where the verdict came from, so the UI can show evidence provenance. */
export type FindingSource =
  | 'ofgem-cap'
  | 'arithmetic'
  | 'vat'
  | 'site-baseline'
  | 'metering-policy'
  | 'tariff-model'
  | 'portfolio-trend'
  | 'billing-rules'
  | 'invoice-history';

export interface FindingEvidence {
  label: string;
  value: string;
}

export interface AnalysisFinding {
  /** Stable machine code, e.g. `unit-rate-above-cap`. Used for dedupe + tests. */
  code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  detail: string;
  evidence: FindingEvidence[];
  /**
   * GBP. Positive = recoverable overcharge (the supplier owes you).
   * Negative = real but favourable cost (e.g. an avoidable tariff uplift).
   */
  impactGbp: number;
  /** 0–1. Deterministic checks score high; modelled estimates score lower. */
  confidence: number;
  recommendation: string;
  source: FindingSource;
}

/** Everything the engine needs about one bill. All fields are optional except the core three. */
export interface BillInput {
  supplier?: string;
  /** Billing period start, ISO `YYYY-MM-DD`. */
  periodStart?: string;
  periodEnd?: string;
  consumptionKwh?: number;
  unitRateP?: number;
  standingChargeP?: number;
  /** Total the supplier actually charged, GBP. Drives the arithmetic check. */
  totalGbp?: number;
  /** VAT the supplier actually added, GBP (not the rate). */
  vatGbp?: number;
  paymentMethod?: 'direct-debit' | 'standard-credit' | 'prepayment';
  /** Optional: share of usage that falls in cheap off-peak windows, 0–1. */
  nightShare?: number;
  tariffName?: string;
  /** True when the site is known to be on a business (unregulated) contract. */
  businessContract?: boolean;
  /** True when the reading behind this bill was estimated, not actual. */
  isEstimate?: boolean;
  /** Date the supplier issued this bill, ISO `YYYY-MM-DD`. Enables the SLC 21.10A 12-month test. */
  issuedAt?: string;
}

/**
 * One previous invoice from the same site, reduced to what the history checks
 * need: back-billing, unit-rate creep and estimated-reading streaks. Routes
 * build these from stored invoices (`toPriorBill` in `lib/audit.ts`); the
 * engine sorts and interprets them, so callers never have to pre-sort.
 */
export interface PriorBill {
  periodStart?: string;
  periodEnd?: string;
  /** Unit rate charged on that invoice, p/kWh. */
  unitRateP?: number;
  /** True when that invoice was itself raised on an estimated reading. */
  isEstimate?: boolean;
}

export interface BillAnalysis {
  /** 0–100. 100 = nothing found. */
  score: number;
  findings: AnalysisFinding[];
  /** Sum of positive impacts — the recoverable amount. */
  recoverableGbp: number;
  /** Number of days the period actually spans. */
  periodDays: number | null;
  /** Recomputed ex-VAT total from kWh × rate + standing charge × days. */
  expectedTotalGbp: number | null;
  /** All-in cost per kWh, the single most useful number on a bill. */
  effectiveRateP: number | null;
  region: { id: string; name: string; estimated: boolean } | null;
  capPeriod: { id: string; label: string; averageUnitRateP: number; electricityVatPct: number };
}

export interface SiteRisk {
  siteId: string;
  name: string;
  score: number;
  flaggedInvoices: number;
  recoverableGbp: number;
  /** Annualised kWh from the most recent bill, used for metering thresholds. */
  annualisedKwh: number;
  topCodes: string[];
}