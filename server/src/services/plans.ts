/**
 * The plan catalogue — the single source of truth for pricing, limits and
 * features. Nothing else in the codebase may hardcode a price, a limit or a
 * feature list; the API serves this file and every client renders it.
 *
 * ── Where this comes from ────────────────────────────────────────────────────
 * README.md §"Feature overview" → "Plans & Billing":
 *   "Starter £49 / Growth £149 / Autonomous £249 per site/month, an interactive
 *    performance-fee calculator (15% of verified savings), flexibility revenue
 *    share, annual value summary and the plan's worked business case."
 *
 * So the README fixes the names, the three prices and the billing frequency
 * (per site, per month). Feature copy is the shipped feature set.
 *
 * ── What the README does NOT define (and is therefore marked, not invented) ──
 *  • ANNUAL PRICING — the README only prices per site per **month**. There is no
 *    annual price, so `annualPricePerSite` is `null` and the API reports
 *    `annualBillingAvailable: false`. Today the product is monthly-only; add a
 *    number here (and nothing else) when the commercial team publishes one.
 *  • SITE CAPS — the README prices *per site* and does not cap sites per plan.
 *    The caps below are therefore PROVISIONAL commercial assumptions, marked
 *    with `SITE_LIMIT_PROVENANCE` and surfaced as such in the API payload, so
 *    the enforcement layer can be switched to the real numbers in one edit.
 */
import type { Plan } from '../types.js';

export type PlanId = 'starter' | 'growth' | 'autonomous';
export type BillingPeriod = 'monthly' | 'annual';

export const PLAN_IDS: readonly PlanId[] = ['starter', 'growth', 'autonomous'] as const;

export const BILLING_PERIODS: readonly BillingPeriod[] = ['monthly', 'annual'] as const;

/** `provisional` = not specified by the README; see the file header. */
export const SITE_LIMIT_PROVENANCE = 'provisional' as const;

/** `null` = the README defines no annual price, so annual billing is off. */
export const ANNUAL_BILLING_AVAILABLE = false;

export interface PlanDefinition extends Plan {
  id: PlanId;
  /** Sites included in the subscription. Enforced server-side per request. */
  siteLimit: number;
  /** What the plan deliberately does not include. */
  restrictions: string[];
  /** Annual price per site. `null` until the README/business defines one. */
  annualPricePerSite: number | null;
  /** Plans stay listed but cannot be bought when inactive. */
  active: boolean;
}

export const PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    pricePerSite: 49,
    annualPricePerSite: null,
    siteLimit: 3,
    tagline: 'Find and fix what you are wasting.',
    features: [
      'Bill auditing and error detection',
      'Live monitoring dashboard',
      'AI energy assistant (Copilot)',
      'Anomaly and overnight-waste detection',
      'Monthly cost-saving plan',
    ],
    restrictions: [
      'No half-hourly consumption analysis',
      'No verified-savings reports',
      'Single-site reporting only',
    ],
    active: true,
  },
  {
    id: 'growth',
    name: 'Growth',
    pricePerSite: 149,
    annualPricePerSite: null,
    siteLimit: 10,
    tagline: 'Continuously reduce what you spend.',
    highlight: true,
    features: [
      'Everything in Starter',
      'Half-hourly consumption analysis',
      'Consumption and price forecasting',
      'Tariff optimisation and dispute letters',
      'Verified savings reports',
      'Multi-site management',
    ],
    restrictions: ['No automated asset control', 'No flexibility market participation'],
    active: true,
  },
  {
    id: 'autonomous',
    name: 'Autonomous',
    pricePerSite: 249,
    annualPricePerSite: null,
    siteLimit: 25,
    tagline: 'Let EnerOS run the eligible assets for you.',
    features: [
      'Everything in Growth',
      'Automated EV charger control (with approval)',
      'Battery optimisation',
      'Flexibility market participation',
      'Advanced integrations (BMS, VPP, hardware)',
      'Safety-limited: never refrigeration or alarms',
    ],
    restrictions: ['Automation always stays within the safety policy'],
    active: true,
  },
] as const;

/** The plan that carries the "recommended" marker, per the catalogue. */
export const RECOMMENDED_PLAN_ID: PlanId =
  PLAN_CATALOG.find((plan) => plan.highlight)?.id ?? 'growth';

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === 'string' && (BILLING_PERIODS as readonly string[]).includes(value);
}

export function planById(id: string | null | undefined): PlanDefinition {
  return PLAN_CATALOG.find((plan) => plan.id === id) ?? PLAN_CATALOG[0];
}

/** Plans the pricing UI may offer, in catalogue order. */
export function purchasablePlans(): PlanDefinition[] {
  return PLAN_CATALOG.filter((plan) => plan.active);
}

export interface OrderSummary {
  planId: PlanId;
  planName: string;
  billingPeriod: BillingPeriod;
  /** Sites being billed (minimum 1 — the entry point is a single site). */
  sites: number;
  /** Price per site per month, in pounds. */
  pricePerSite: number;
  /** Recurring amount in pounds for the billing period, before VAT. */
  subtotal: number;
  /** VAT at the standard 20% rate applied to the platform fee. */
  vat: number;
  total: number;
  currency: 'GBP';
  /** Pence, for the payment provider. */
  totalPence: number;
  /** Human-readable lines for the order-summary panel. */
  lines: { label: string; amount: number }[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function planError(message: string): Error & { code: 'plan' } {
  return Object.assign(new Error(message), { code: 'plan' as const });
}

/**
 * Price a subscription order. `monthly` bills one month; `annual` is rejected
 * while the catalogue has no annual price, so the UI can never show a number
 * the business has not defined.
 */
export function priceOrder(
  planId: string,
  billingPeriod: BillingPeriod,
  sites: number,
): OrderSummary {
  const plan = planById(planId);
  if (!plan.active) throw planError('That plan is not available.');
  if (!isBillingPeriod(billingPeriod)) throw planError('Choose a billing period.');
  if (billingPeriod === 'annual' && plan.annualPricePerSite === null) {
    throw planError(
      'Annual billing is not defined for this plan — EnerOS is priced per site, per month.',
    );
  }
  // Bill for the sites the customer actually has (minimum 1). The plan's cap
  // limits how many sites they may *add*; it must not silently under-bill an
  // account that is temporarily over the cap after a downgrade.
  const quantity = Math.max(1, Math.round(sites) || 1);
  const monthly = quantity * plan.pricePerSite;
  const subtotal =
    billingPeriod === 'annual' ? quantity * (plan.annualPricePerSite ?? 0) : monthly;
  const vat = round2(subtotal * 0.2);
  const total = round2(subtotal + vat);
  const periodLabel = billingPeriod === 'annual' ? 'year' : 'month';
  return {
    planId: plan.id,
    planName: plan.name,
    billingPeriod,
    sites: quantity,
    pricePerSite: plan.pricePerSite,
    subtotal,
    vat,
    total,
    currency: 'GBP',
    totalPence: Math.round(total * 100),
    lines: [
      {
        label: `${plan.name} — ${quantity} site${quantity > 1 ? 's' : ''} × £${plan.pricePerSite}/site/${periodLabel}`,
        amount: subtotal,
      },
      { label: 'VAT (20%)', amount: vat },
    ],
  };
}

/** Monthly run-rate for a plan and a live site count (dashboard display). */
export function monthlyRunRate(planId: string, sites: number): number {
  const plan = planById(planId);
  return round2(Math.max(1, Math.round(sites) || 1) * plan.pricePerSite);
}
