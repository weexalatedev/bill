/**
 * Ofgem / DESNZ energy price cap — reference data for GB electricity.
 *
 * SOURCE OF TRUTH: Ofgem "Energy price cap unit rates and standing charges"
 *   https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/
 *   energy-pricing-rules/energy-price-cap/energy-price-cap-default-tariff-levels
 *
 * These numbers are *domestic default-tariff* caps. Business (non-domestic) rates
 * are unregulated — a site on a business contract may legitimately pay far more
 * than the cap. We therefore never treat "above cap" as an automatic breach; it
 * is a prompt to check whether the site is actually on a capped tariff.
 *
 * ── REFRESHING ────────────────────────────────────────────────────────────────
 * The cap is reissued quarterly. Next publication dates after the period below:
 *   • 25 Nov 2026 → 1 Jan 2027 – 31 Mar 2027
 *   • 23 Feb 2027 → 1 Apr 2027 – 30 Jun 2027
 *   • 26 May 2027 → 1 Jul 2027 – 30 Sep 2027
 * When a new period is published: copy the new table into `CAP_PERIODS`, then move
 * `currentCapPeriodId` to it. Nothing else in the engine hard-codes cap values.
 */

export type PaymentMethod = 'direct-debit' | 'standard-credit' | 'prepayment';

export interface CapRegion {
  /** Ofgem's own ordering (1 = cheapest unit rate). */
  rank: number;
  /** Stable key used by the API and stored on sites. */
  id: string;
  /** Display name exactly as Ofgem publishes it. */
  name: string;
  unitRateP: number;
  standingChargeP: number;
  prepaymentUnitRateP: number;
  standardCreditUnitRateP: number;
}

export interface CapPeriod {
  id: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  label: string;
  /** GB average across regions, as published by Ofgem. */
  averageUnitRateP: number;
  averageStandingChargeP: number;
  /** Headline change vs the previous quarter, as published. */
  changePct: number;
  /**
   * VAT treatment. From 1 Oct 2026 the government removed VAT from domestic
   * electricity until 31 Mar 2027, so cap-covered electricity bills in this
   * window are quoted ex-VAT. Business suppliers may still charge VAT — which is
   * exactly why this is flagged for review rather than auto-corrected.
   */
  electricityVatPct: number;
  regions: CapRegion[];
}

const region = (
  rank: number,
  id: string,
  name: string,
  unitRateP: number,
  standingChargeP: number,
  prepaymentUnitRateP: number,
  standardCreditUnitRateP: number,
): CapRegion => ({ rank, id, name, unitRateP, standingChargeP, prepaymentUnitRateP, standardCreditUnitRateP });

/**
 * 1 October – 31 December 2026. Single-rate meters, Direct Debit, ex-VAT.
 * Transcribed from Ofgem's published tables for this period.
 */
const CAP_2026_Q4: CapPeriod = {
  id: '2026-Q4',
  start: '2026-10-01',
  end: '2026-12-31',
  label: '1 Oct – 31 Dec 2026',
  averageUnitRateP: 26.32,
  averageStandingChargeP: 54.83,
  changePct: -1.7,
  electricityVatPct: 0,
  regions: [
    region(1, 'east-midlands', 'East Midlands', 25.36, 51.45, 24.58, 26.78),
    region(2, 'north-eastern-england', 'North Eastern England', 25.46, 61.58, 24.68, 26.89),
    region(3, 'west-midlands', 'West Midlands', 25.6, 57.23, 24.82, 27.04),
    region(4, 'yorkshire', 'Yorkshire', 25.6, 61.67, 24.82, 27.05),
    region(5, 'southern-scotland', 'Southern Scotland', 26.11, 61.41, 25.31, 27.58),
    region(6, 'northern-scotland', 'Northern Scotland', 26.35, 55.14, 25.54, 27.83),
    region(7, 'southern-england', 'Southern England', 26.47, 47.81, 25.66, 27.95),
    region(8, 'north-western-england', 'North Western England', 26.49, 45.68, 25.68, 27.98),
    region(9, 'southern-wales', 'Southern Wales', 26.55, 55.41, 25.74, 28.05),
    region(10, 'south-western-england', 'South Western England', 26.58, 55.58, 25.77, 28.08),
    region(11, 'london', 'London', 26.6, 42.92, 25.78, 28.09),
    region(12, 'eastern-england', 'Eastern England', 26.61, 51.84, 25.8, 28.11),
    region(13, 'south-eastern-england', 'South Eastern England', 26.88, 52.32, 26.06, 28.39),
    region(14, 'merseyside-north-wales', 'Merseyside and Northern Wales', 27.86, 67.66, 27.01, 29.43),
  ],
};

export const CAP_PERIODS: CapPeriod[] = [CAP_2026_Q4];

/** The period the engine quotes against. */
export const currentCapPeriodId = CAP_2026_Q4.id;

export function getCapPeriod(id: string = currentCapPeriodId): CapPeriod {
  return CAP_PERIODS.find((p) => p.id === id) ?? CAP_2026_Q4;
}

/** The cap period covering a given ISO date, falling back to the current one. */
export function capPeriodForDate(isoDate: string): CapPeriod {
  const day = isoDate.slice(0, 10);
  return CAP_PERIODS.find((p) => day >= p.start && day <= p.end) ?? getCapPeriod();
}

export function getRegion(id: string, period: CapPeriod = getCapPeriod()): CapRegion | undefined {
  const key = id.trim().toLowerCase().replace(/\s+/g, '-');
  return period.regions.find((r) => r.id === key || r.name.toLowerCase() === id.trim().toLowerCase());
}

/**
 * Human labels → canonical region ids.
 *
 * Real customer data (and our own seeded dataset) carries informal region names
 * rather than Ofgem's exact wording, so resolve the common variants instead of
 * silently failing to benchmark — a missing region turns off every cap check,
 * which is a bad failure mode to fail quietly on.
 */
const REGION_ALIASES: Record<string, string> = {
  'north-west': 'north-western-england',
  'north-west-england': 'north-western-england',
  'nw': 'north-western-england',
  'north-east': 'north-eastern-england',
  'ne': 'north-eastern-england',
  'merseyside': 'merseyside-north-wales',
  'merseyside-and-northern-wales': 'merseyside-north-wales',
  'wales': 'southern-wales',
  'scotland': 'southern-scotland',
  'south-scotland': 'southern-scotland',
  'north-scotland': 'northern-scotland',
  'highlands': 'northern-scotland',
  'south-coast': 'southern-england',
  'south-east': 'south-eastern-england',
  'south-east-england': 'south-eastern-england',
  'south-west': 'south-western-england',
  'south-west-england': 'south-western-england',
  'west-midlands': 'west-midlands',
  'midlands': 'east-midlands',
  'east-midlands': 'east-midlands',
  'east-anglia': 'eastern-england',
  'london': 'london',
  'yorkshire': 'yorkshire',
  'yorkshire-and-humber': 'yorkshire',
};

/** Resolve any known region label to a cap region, or `undefined`. */
export function resolveRegionByLabel(label: string, period: CapPeriod = getCapPeriod()): CapRegion | undefined {
  if (!label) return undefined;
  const direct = getRegion(label, period);
  if (direct) return direct;
  const key = label.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const aliased = REGION_ALIASES[key];
  return aliased ? getRegion(aliased, period) : undefined;
}

/** Effective unit rate for a payment method. */
export function unitRateFor(regionRef: CapRegion, method: PaymentMethod): number {
  if (method === 'prepayment') return regionRef.prepaymentUnitRateP;
  if (method === 'standard-credit') return regionRef.standardCreditUnitRateP;
  return regionRef.unitRateP;
}

/**
 * Postcode → cap region, derived from the outward-code area.
 *
 * This is a *heuristic*, not an authoritative lookup. Ofgem publishes the real
 * mapping through its "compare by area" tool and the postcode directory; this
 * exists so a new signup can be benchmarked immediately. The API always labels
 * the result as an estimate, and an explicit region on a site always wins.
 */
export function regionForPostcode(postcode: string): CapRegion | undefined {
  const match = postcode.trim().toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2}\d)/);
  if (!match) return undefined;
  const p = match[1];
  const period = getCapPeriod();
  const at = (id: string): CapRegion => getRegion(id, period) as CapRegion;

  // Scotland — the Highlands & Islands boundary follows Ofgem's, not the UK's.
  if (/^(IV|KW|HS|ZE)/.test(p)) return at('northern-scotland');
  if (/^(PH1|PH2)/.test(p)) return at('northern-scotland');
  if (/^(PH3|PH4|PH5|PH6|PH7|PH8|EH|FK|G|ML|PA|TD|DG|KA|AB)/.test(p)) return at('southern-scotland');

  // Wales — North Wales is billed inside the Merseyside & Northern Wales region.
  if (/^(LL|SY)/.test(p)) return at('merseyside-north-wales');
  if (/^(CF|SA)/.test(p)) return at('southern-wales');

  // North West England / Merseyside / Lancashire.
  if (/^(L|CH|WA|SK|OL)/.test(p)) return at('merseyside-north-wales');
  if (/^(BL|CA|FY|M|WN)/.test(p)) return at('north-western-england');

  // London is tested first: several of its outward codes (SE, SW, W, NW, E) are
  // prefixes of codes that belong to other regions, and Ofgem bills London as a
  // region of its own.
  if (/^(E|EC|N|NW|SE|SW|W|WC)/.test(p)) return at('london');

  if (/^NE/.test(p)) return at('north-eastern-england');
  if (/^(BD|DN|HG|HX|LS|S|WF|YO)/.test(p)) return at('yorkshire');
  if (/^(DE|LE|LN|NG|NN|PE)/.test(p)) return at('east-midlands');
  if (/^(B|CV|DY|HR|ST|TF|WV|WR|WS)/.test(p)) return at('west-midlands');
  if (/^(AL|CM|IP|LU|NR|SG|SS)/.test(p)) return at('eastern-england');
  if (/^(BA|BH|BS|DT|EX|GL|PL|SN|TA|TQ|TR)/.test(p)) return at('south-western-england');
  if (/^(CT|DA|EN|IG|ME|TN|RH|BN)/.test(p)) return at('south-eastern-england');
  if (/^(GU|HA|HP|KT|OX|PO|SM|SO|TW)/.test(p)) return at('southern-england');

  return undefined;
}