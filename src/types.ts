'use client';
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
  /** Controllable loads discovered on site (Module D / E). */
  loads: string[];
  /** Last time the AI Energy Brain refreshed this site's model. */
  lastSynced: string;
  /** How much real consumption data we hold for this site. */
  dataQuality?: {
    consumption: 'none' | 'bill-only' | 'hh';
    coveragePct: number;
    lastReadingAt?: string;
  };
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
  id: 'starter' | 'growth' | 'autonomous';
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

// ── Smart Analysis (mirrors server/src/types.ts) ────────────────────────────────

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high';

export type FindingCategory = 'pricing' | 'metering' | 'consumption' | 'opportunity';

export type FindingSource =
  | 'ofgem-cap'
  | 'arithmetic'
  | 'vat'
  | 'site-baseline'
  | 'metering-policy'
  | 'tariff-model'
  | 'portfolio-trend';

export interface FindingEvidence {
  label: string;
  value: string;
}

export interface AnalysisFinding {
  code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  detail: string;
  evidence: FindingEvidence[];
  /** Positive = recoverable overcharge. Negative = a real but favourable cost. */
  impactGbp: number;
  confidence: number;
  recommendation: string;
  source: FindingSource;
}

export interface BillAnalysis {
  score: number;
  findings: AnalysisFinding[];
  recoverableGbp: number;
  periodDays: number | null;
  expectedTotalGbp: number | null;
  effectiveRateP: number | null;
  region: { id: string; name: string; estimated: boolean } | null;
  capPeriod: {
    id: string;
    label: string;
    averageUnitRateP: number;
    electricityVatPct: number;
  };
  /** The same bill priced at the UK reference (Ofgem cap) rate. */
  benchmark: BillBenchmark | null;
}

/**
 * The bill measured against the published UK reference rate — the number behind
 * "you paid £500, the UK median says £400, so you could save £100".
 *
 * `savingGbp > 0` means the customer paid more than the benchmark.
 */
export interface BillBenchmark {
  /** What the reference is: the site's regional Ofgem cap, or the GB average. */
  label: string;
  /** Reference unit rate, pence per kWh. */
  unitRateP: number;
  /** Reference standing charge, pence per day. */
  standingChargeP: number;
  /** Consumption the benchmark was priced on, kWh. */
  consumptionKwh: number | null;
  /** Days used for the standing charge. */
  periodDays: number;
  /** What this consumption would cost at the reference rate, GBP. */
  expectedTotalGbp: number | null;
  /** What the supplier actually charged for the same period, GBP. */
  actualTotalGbp: number | null;
  /** actual − expected. Positive = the customer could save this much. */
  savingGbp: number | null;
  /** `savingGbp` as a share of the actual total, %. */
  savingPct: number | null;
}

export interface SiteRisk {
  siteId: string;
  name: string;
  score: number;
  flaggedInvoices: number;
  recoverableGbp: number;
  annualisedKwh: number;
  topCodes: string[];
}
// ── Subscription / billing (mirrors server/src/services/subscription.ts) ──────

export type BillingPeriod = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'none'
  | 'pending'
  | 'payment_pending'
  | 'active'
  | 'failed'
  | 'cancelled'
  | 'expired';

/** A plan as published by `/api/plans` — the only source of pricing truth. */
export interface PlanDefinition extends Plan {
  siteLimit: number;
  restrictions: string[];
  annualPricePerSite: number | null;
  active: boolean;
}

export interface OrderLine {
  label: string;
  amount: number;
}

export interface OrderSummary {
  planId: Plan['id'];
  planName: string;
  billingPeriod: BillingPeriod;
  sites: number;
  pricePerSite: number;
  subtotal: number;
  vat: number;
  total: number;
  currency: 'GBP';
  totalPence: number;
  lines: OrderLine[];
}

export interface PaymentRecord {
  id: string;
  planId: Plan['id'];
  planName: string;
  billingPeriod: BillingPeriod;
  provider: 'stripe' | 'dev';
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amountPence: number;
  amountGbp: number;
  currency: string;
  description: string;
  createdAt: string;
  paidAt: string | null;
  failureReason: string | null;
}

export interface SubscriptionView {
  status: SubscriptionStatus;
  isActive: boolean;
  planId: Plan['id'];
  planName: string;
  planTagline: string;
  pricePerSite: number;
  billingPeriod: BillingPeriod;
  siteLimit: number;
  siteLimitSource: string;
  sitesUsed: number;
  remainingSites: number;
  canAddSite: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  monthlyGbp: number;
  pendingChange: { planId: Plan['id']; planName: string; billingPeriod: BillingPeriod } | null;
  pendingPaymentId: string | null;
  latestPayment: PaymentRecord | null;
  stripeEnabled: boolean;
  devMode: boolean;
}

export interface PlansResponse {
  plans: PlanDefinition[];
  allPlans: PlanDefinition[];
  billingPeriods: BillingPeriod[];
  annualBillingAvailable: boolean;
  recommendedPlanId: Plan['id'];
  currency: string;
  priceBasis: string;
  vatRatePct: number;
  siteLimitSource: string;
  notes: { annualPricing: string; siteLimits: string };
}
