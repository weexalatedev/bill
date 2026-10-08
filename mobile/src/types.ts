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