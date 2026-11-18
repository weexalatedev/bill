/**
 * The plan catalogue — the single source of truth for pricing, limits and
 * features. Nothing else in the codebase may hardcode a price, a limit or a
 * feature list; the API serves this file and every client renders it.
 *
 * ── Where this comes from ────────────────────────────────────────────────────
 * The commercial plan fixed by the founder:
 *   House        (Starter)    £29 /site/month  · £329 /site/year
 *   Medium scale (Growth)     £99 /site/month  · £999 /site/year
 *   Large scale  (Autonomous) £199 /site/month · £1,999 /site/year
 *
 * Both billing periods are defined, so annual billing is available and the
 * pricing UI shows the annual saving against paying monthly (see
 * `annualSavingsPct`). Feature copy is the shipped feature set.
 *
 * ── What is marked, not invented ─────────────────────────────────────────────
 *  • SITE CAPS — the founder prices *per site* and does not cap sites per plan.
 *    The caps below are therefore PROVISIONAL commercial assumptions, marked
 *    with `SITE_LIMIT_PROVENANCE` and surfaced as such in the API payload, so
 *    the enforcement layer can be switched to the real numbers in one edit.
 */
import type { Plan } from '../types.js';

export type PlanId = 'starter' | 'growth' | 'autonomous';
export type BillingPeriod = 'monthly' | 'annual';

export const PLAN_IDS: readonly PlanId[] = ['starter', 'growth', 'autonomous'] as const;

export const BILLING_PERIODS: readonly BillingPeriod[] = ['monthly', 'annual'] as const;

/** `provisional` = not specified by the founder plan; see the file header. */
export const SITE_LIMIT_PROVENANCE = 'provisional' as const;

/** Annual prices are defined for every plan, so annual billing is on. */
export const ANNUAL_BILLING_AVAILABLE = true;

export interface PlanDefinition extends Plan {
  id: PlanId;
  /** Sites included in the subscription. Enforced server-side per request. */
  siteLimit: number;
  /** Maximum number of connected devices (EVs, batteries, heat pumps) the plan supports. */
  deviceLimit: number;
  /** The handful of features shown on the pricing card; full list is `features`. */
  keyFeatures: string[];
  /** What the plan deliberately does not include. */
  restrictions: string[];
  /** Annual price per site, in pounds. */
  annualPricePerSite: number;
  /** Plans stay listed but cannot be bought when inactive. */
  active: boolean;
}

export const PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    pricePerSite: 29,
    annualPricePerSite: 329,
    siteLimit: 1,
    deviceLimit: 2,
    tagline: 'Find and fix what you are wasting.',
    keyFeatures: [
      'Bill auditing and error detection',
      'Live monitoring dashboard',
      'AI energy assistant (Copilot)',
    ],
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
    pricePerSite: 99,
    annualPricePerSite: 999,
    siteLimit: 10,
    deviceLimit: 5,
    tagline: 'Continuously reduce what you spend.',
    highlight: true,
    keyFeatures: [
      'Everything in Starter',
      'Half-hourly consumption analysis',
      'Verified savings reports',
      'Multi-site management',
    ],
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
    pricePerSite: 199,
    annualPricePerSite: 1999,
    siteLimit: 10,
    deviceLimit: 7,
    tagline: 'Let EnerOS run the eligible assets for you.',
    keyFeatures: [
      'Everything in Growth',
      'Automated EV charger control (with approval)',
      'Battery optimisation',
      'Flexibility market participation',
    ],
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

/** Whole-percentage saving of annual billing over paying monthly, 0 when it would not save. */
export function annualSavingsPct(plan: Pick<PlanDefinition, 'pricePerSite' | 'annualPricePerSite'>): number {
  const monthlyYearly = plan.pricePerSite * 12;
  if (monthlyYearly <= 0 || plan.annualPricePerSite >= monthlyYearly) return 0;
  return Math.round((1 - plan.annualPricePerSite / monthlyYearly) * 100);
}

/**
 * Price a subscription order. `monthly` bills one month at `pricePerSite ÷ 1`;
 * `annual` bills a year at `annualPricePerSite` per site.
 */
export function priceOrder(
  planId: string,
  billingPeriod: BillingPeriod,
  sites: number,
): OrderSummary {
  const plan = planById(planId);
  if (!plan.active) throw planError('That plan is not available.');
  if (!isBillingPeriod(billingPeriod)) throw planError('Choose a billing period.');

  // Bill for the sites the customer actually has (minimum 1). The plan's cap
  // limits how many sites they may *add*; it must not silently under-bill an
  // account that is temporarily over the cap after a downgrade.
  const quantity = Math.max(1, Math.round(sites) || 1);
  const perSite = billingPeriod === 'annual' ? plan.annualPricePerSite : plan.pricePerSite;
  const subtotal = round2(quantity * perSite);
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
        label: `${plan.name} — ${quantity} site${quantity > 1 ? 's' : ''} × £${perSite}/site/${periodLabel}`,
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

/** The per-period recurring amount for a plan and site count, before VAT. */
export function recurringAmount(planId: string, sites: number, billingPeriod: BillingPeriod): number {
  const plan = planById(planId);
  const quantity = Math.max(1, Math.round(sites) || 1);
  const perSite = billingPeriod === 'annual' ? plan.annualPricePerSite : plan.pricePerSite;
  return round2(quantity * perSite);
}
