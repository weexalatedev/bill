/**
 * EnerOS Smart Analysis — the deterministic bill engine.
 *
 * Design rule: **the engine decides, the LLM explains.** Every verdict below is
 * arithmetic against a published source (Ofgem cap tables, the bill's own
 * numbers, the site's own history). Nothing is guessed, so every finding can
 * carry its evidence and be defended to a supplier. Optional enrichment
 * (LLM narration of a pasted bill, half-hourly weather) layers on top in
 * `llm.ts` / `weather.ts` but never replaces a check here.
 *
 * Money convention: `impactGbp > 0` means the customer is owed money.
 */

import {
  capPeriodForDate,
  getCapPeriod,
  regionForPostcode,
  resolveRegionByLabel,
  unitRateFor,
  type CapRegion,
} from './priceCap.js';
import type {
  AnalysisFinding,
  BillAnalysis,
  BillBenchmark,
  BillInput,
  FindingSeverity,
  PriorBill,
  Site,
  SiteRisk,
} from '../types.js';

// ── Tunables ───────────────────────────────────────────────────────────────────

/** Tolerated gap (GBP) between the supplier's total and our recomputation. */
const ARITHMETIC_TOLERANCE_GBP = 0.5;
/** A rate above this multiple of the regional cap means a non-capped/deemed rate. */
const DEEMED_RATE_MULTIPLE = 1.35;
/** Standing charge above this share of the bill means the tariff is mis-shaped. */
const STANDING_CHARGE_DOMINANCE = 0.2;
/** BAL requires HH metering for non-domestic sites at/above 250,000 kWh/yr. */
const HH_METERING_KWH_PER_YEAR = 250_000;
/** Consumption beyond this multiple of the site's own baseline is anomalous. */
const CONSUMPTION_ANOMALY_MULTIPLE = 1.35;
/** Below this annualised kWh a site is unlikely to break even on a business tariff. */
const SMALL_SITE_KWH_PER_YEAR = 15_000;
/** Typical off-peak discount for a 7-hour night block on a UK business tariff. */
const OFF_PEAK_DISCOUNT = 0.35;
/** Below this a modelled time-of-use saving is not worth recommending. */
const TOU_MIN_SAVING_GBP = 25;
/** SLC 21.10A: energy used more than 12 months ago cannot be charged (households + microbusinesses). */
const BACK_BILL_LIMIT_MONTHS = 12;
/** Below this a unit-rate rise is indistinguishable from printing noise (p/kWh). */
const RATE_CREEP_MIN_FLOOR_P = 0.1;
/** A rise below this only counts when it is also a meaningful percentage (p/kWh). */
const RATE_CREEP_MIN_P = 0.5;
const RATE_CREEP_MIN_PCT = 1.5;
/** Consecutive estimated bills that turn an estimate into a pattern. */
const ESTIMATED_READ_STREAK = 2;

const SEVERITY_PENALTY: Record<FindingSeverity, number> = {
  info: 0,
  low: 8,
  medium: 18,
  high: 32,
};

const SEVERITY_ORDER: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

const round2 = (n: number): number => Math.round(n * 100) / 100;
const gbp = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct1 = (n: number): string => `${n.toFixed(1)}%`;

// ── Input resolution ───────────────────────────────────────────────────────────

/** Days spanned by the billing period, inclusive of both ends. */
export function periodDays(input: BillInput): number | null {
  if (!input.periodStart || !input.periodEnd) return null;
  const start = Date.parse(`${input.periodStart.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${input.periodEnd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Resolve the benchmark region. An explicit region always wins; otherwise we
 * estimate from the site postcode and mark the result as estimated.
 */
export function resolveRegion(
  explicitRegion?: string,
  postcode?: string,
): { region: CapRegion; estimated: boolean } | null {
  if (explicitRegion) {
    const found = resolveRegionByLabel(explicitRegion);
    if (found) return { region: found, estimated: false };
  }
  if (postcode) {
    const guess = regionForPostcode(postcode);
    if (guess) return { region: guess, estimated: true };
  }
  return null;
}

// ── Invoice-history helpers ─────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse an ISO `YYYY-MM-DD` (or longer) string to a UTC day index. */
function dayIndex(iso?: string): number | null {
  if (!iso) return null;
  const parsed = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : Math.round(parsed / DAY_MS);
}

/** "12 Mar 2026" — stable, locale-safe labels for evidence lines. */
function dateLabel(iso?: string): string | null {
  const idx = dayIndex(iso);
  if (idx === null) return null;
  const date = new Date(idx * DAY_MS);
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Whole months from `earlier` to `later`; null when either date is missing. */
function monthsBetween(earlier?: string, later?: string): number | null {
  const from = dayIndex(earlier);
  const to = dayIndex(later);
  if (from === null || to === null || to <= from) return null;
  return Math.floor((to - from) / 30.4375); // mean Gregorian month
}

/**
 * Normalise caller-supplied history: drop entries with no usable period end
 * and sort oldest first. The engine never trusts the order it is handed.
 */
function orderedHistory(history: PriorBill[]): Array<PriorBill & { endIdx: number }> {
  return history
    .map((bill) => ({ ...bill, endIdx: dayIndex(bill.periodEnd) ?? -1 }))
    .filter((bill) => bill.endIdx >= 0)
    .sort((a, b) => a.endIdx - b.endIdx);
}

// ── Checks ─────────────────────────────────────────────────────────────────────

/** 1. Is the unit rate above the Ofgem cap for the site's region? */
function checkUnitRate(
  input: BillInput,
  region: CapRegion,
  estimated: boolean,
): AnalysisFinding | null {
  const rate = input.unitRateP;
  if (rate === undefined || input.consumptionKwh === undefined) return null;

  const cap = unitRateFor(region, input.paymentMethod ?? 'direct-debit');
  const excessP = round2(rate - cap);
  // 1% tolerance absorbs rounding in the printed rate.
  if (excessP / cap <= 0.01) return null;

  const impact = round2((excessP * input.consumptionKwh) / 100);
  const above = rate > cap * DEEMED_RATE_MULTIPLE;

  return {
    code: 'unit-rate-above-cap',
    category: 'pricing',
    severity: above ? 'high' : 'medium',
    title: `Unit rate ${rate.toFixed(2)}p/kWh is above the ${region.name} cap of ${cap.toFixed(2)}p`,
    detail: above
      ? `This is ${pct1(((rate - cap) / cap) * 100)} above the Ofgem cap — the signature of an out-of-contract or deemed rate. Suppliers must apply standard terms within 28 days of a contract ending (SLC 21.5A).`
      : `The site is billed ${excessP.toFixed(2)}p/kWh above the cap for ${region.name}. If this site is on a default tariff the excess is not permitted.`,
    evidence: [
      { label: 'Billed rate', value: `${rate.toFixed(2)}p/kWh` },
      { label: `Ofgem cap (${region.name})`, value: `${cap.toFixed(2)}p/kWh` },
      { label: 'Region source', value: estimated ? 'Estimated from postcode' : 'Set on site' },
    ],
    impactGbp: input.businessContract ? 0 : impact,
    confidence: input.businessContract ? 0.4 : 0.95,
    recommendation: input.businessContract
      ? 'Confirm the contract end date, then start a re-tender 60 days out — being above the domestic cap is normal for business supply, but it should never be above the market.'
      : `Ask the supplier to re-rate to ${cap.toFixed(2)}p/kWh. Over a 12-month bill this is roughly ${gbp(impact * 12)}.`,
    source: 'ofgem-cap',
  };
}

/** 2. Is the standing charge above the regional cap? */
function checkStandingCharge(
  input: BillInput,
  region: CapRegion,
  days: number | null,
): AnalysisFinding | null {
  const charge = input.standingChargeP;
  if (charge === undefined) return null;
  const cap = region.standingChargeP;
  if (charge / cap <= 1.01) return null;

  return {
    code: 'standing-charge-above-cap',
    category: 'pricing',
    severity: 'medium',
    title: `Standing charge ${charge.toFixed(2)}p/day is above the ${region.name} cap of ${cap.toFixed(2)}p`,
    detail:
      'The standing charge is billed daily regardless of usage, so an inflated one compounds on every invoice — including invoices for empty premises.',
    evidence: [
      { label: 'Billed standing charge', value: `${charge.toFixed(2)}p/day` },
      { label: `Ofgem cap (${region.name})`, value: `${cap.toFixed(2)}p/day` },
      ...(days ? [{ label: 'Over this period', value: gbp(round2(((charge - cap) * days) / 100)) }] : []),
    ],
    impactGbp: input.businessContract ? 0 : round2(((charge - cap) * (days ?? 30)) / 100),
    confidence: 0.9,
    recommendation: `Request a correction to ${cap.toFixed(2)}p/day and a refund of the difference for this period.`,
    source: 'ofgem-cap',
  };
}

/** 3. Does the supplier's own arithmetic hold up? */
function checkArithmetic(input: BillInput, days: number | null): AnalysisFinding | null {
  const {
    consumptionKwh: kwh,
    unitRateP: rate,
    standingChargeP: standing,
    totalGbp: total,
  } = input;
  if (kwh === undefined || rate === undefined || standing === undefined || total === undefined) return null;
  const chargedDays = days ?? 31;
  const expected = round2((kwh * rate) / 100 + (standing * chargedDays) / 100);
  const delta = round2(total - expected);
  if (Math.abs(delta) <= ARITHMETIC_TOLERANCE_GBP) return null;

  return {
    code: delta > 0 ? 'total-overstated' : 'total-understated',
    category: 'pricing',
    severity: Math.abs(delta) > 25 ? 'high' : 'medium',
    title:
      delta > 0
        ? `The bill is ${gbp(delta)} higher than kWh × rate + standing charge`
        : `The bill is ${gbp(Math.abs(delta))} lower than the itemised charges`,
    detail:
      delta > 0
        ? 'The itemised charges do not add up to the amount charged. This is the most common and most recoverable billing error, and it is provable from the face of the invoice.'
        : 'The invoice total is lower than the itemised charges. Check whether this is a mid-term credit, a prepayments balance, or a misprint before disputing.',
    evidence: [
      { label: 'Charged', value: gbp(total) },
      { label: 'Itemised expectation', value: gbp(expected) },
      { label: 'Difference', value: gbp(delta) },
      {
        label: 'Basis',
        value: `${kwh.toLocaleString('en-GB')} kWh × ${rate.toFixed(2)}p + ${standing.toFixed(2)}p × ${chargedDays} days`,
      },
    ],
    impactGbp: delta > 0 ? delta : 0,
    confidence: 0.99,
    recommendation:
      delta > 0
        ? 'Quote the itemised arithmetic back to the supplier and request a corrected invoice, citing SLC 21.5A (bills must be based on actual readings).'
        : 'No action needed unless you expected a higher charge — raise a query if this looks unfamiliar.',
    source: 'arithmetic',
  };
}

/** 4. Was VAT handled correctly for this period? */
function checkVat(input: BillInput): AnalysisFinding | null {
  const { totalGbp: total, vatGbp: vat, unitRateP: rate } = input;
  if (vat === undefined || total === undefined || total <= 0) return null;
  // VAT removal applies to cap-covered domestic electricity only; business
  // supply keeps the standard 5%, so this check would produce noise there.
  if (input.businessContract) return null;

  const period = capPeriodForDate(input.periodStart ?? new Date().toISOString());
  if (period.electricityVatPct > 0) return null;

  const expectedVat = round2((total * period.electricityVatPct) / 100);
  if (Math.abs(vat - expectedVat) <= 0.5 || vat <= 0.5) return null;
  const fullVat = round2(total * 0.05);
  const shouldHaveHadRelief = vat > fullVat;

  return {
    code: 'vat-removal-not-applied',
    category: 'pricing',
    severity: shouldHaveHadRelief ? 'high' : 'low',
    title: 'VAT appears to have been charged when the relief makes it zero',
    detail:
      `VAT was removed from domestic electricity from ${period.start} to ${period.end}. ` +
      (shouldHaveHadRelief
        ? `This bill still carries ${gbp(vat)} of VAT, so the relief has not been passed on.`
        : 'The VAT on this bill is unexpected — confirm whether this supply is cap-covered.') +
      (rate ? ` At a ${rate.toFixed(2)}p/kWh unit rate the supply looks cap-covered.` : ''),
    evidence: [
      { label: 'VAT charged', value: gbp(vat) },
      { label: 'VAT expected', value: gbp(expectedVat) },
      { label: 'Relief window', value: period.label },
      { label: 'Source', value: 'Ofgem / DESNZ VAT announcement' },
    ],
    impactGbp: round2(vat - expectedVat),
    confidence: shouldHaveHadRelief ? 0.9 : 0.5,
    recommendation: shouldHaveHadRelief
      ? 'Raise a VAT correction with the supplier. Because the relief is supplier-liable, refunds are usually processed within 30 days.'
      : 'Verify with the supplier whether this is a business-rate supply before disputing.',
    source: 'vat',
  };
}

/** 5. Consumption compared with the site's own history. */
function checkConsumption(input: BillInput, site: Site | undefined, days: number | null): AnalysisFinding | null {
  const kwh = input.consumptionKwh;
  // `monthActual` is absent on partially-provisioned sites, so guard on type as
  // well as value — `undefined <= 0` is false and would let NaN through.
  if (
    kwh === undefined ||
    kwh <= 0 ||
    !site ||
    typeof site.monthActual !== 'number' ||
    !Number.isFinite(site.monthActual) ||
    site.monthActual <= 0
  ) {
    return null;
  }

  // The seeded site model carries spend rather than kWh, so derive a comparable
  // baseline from the site's own spend at the national average cap rate. When
  // real half-hourly data is wired in, `weather.ts` replaces this.
  const baselineKwh = Math.round((site.monthActual / getCapPeriod().averageUnitRateP) * 100);
  if (baselineKwh <= 0) return null;

  const scale = days && days > 0 ? days / 30.4 : 1;
  const expected = baselineKwh * scale;
  if (kwh < expected * CONSUMPTION_ANOMALY_MULTIPLE) return null;
  const overKwh = Math.round(kwh - expected);

  return {
    code: 'consumption-above-baseline',
    category: 'consumption',
    severity: kwh > expected * 1.8 ? 'high' : 'medium',
    title: `Consumption is ${pct1(((kwh - expected) / expected) * 100)} above this site's baseline`,
    detail:
      'A jump this size usually means an equipment fault, a lost setpoint, or an estimated rather than actual reading. It is worth chasing before it becomes recurring cost.',
    evidence: [
      { label: 'This period', value: `${kwh.toLocaleString('en-GB')} kWh` },
      { label: 'Site baseline', value: `${Math.round(expected).toLocaleString('en-GB')} kWh` },
      { label: 'Excess', value: `${overKwh.toLocaleString('en-GB')} kWh` },
    ],
    impactGbp: input.unitRateP ? -round2((overKwh * input.unitRateP) / 100) : 0,
    confidence: 0.65,
    recommendation:
      'Request actual (not estimated) meter reads, and schedule a walk-round on refrigeration and HVAC setpoints for this site.',
    source: 'site-baseline',
  };
}

/** 6. Is the standing charge eating a low-consumption bill? */
function checkStandingChargeDominance(input: BillInput, days: number | null): AnalysisFinding | null {
  const { standingChargeP: standing, consumptionKwh: kwh, unitRateP: rate, totalGbp: total } = input;
  if (!standing || !kwh || !rate || total === undefined || total <= 0) return null;
  const chargedDays = days ?? 31;
  const standingCost = (standing * chargedDays) / 100;
  if (standingCost / total <= STANDING_CHARGE_DOMINANCE) return null;

  return {
    code: 'standing-charge-dominates',
    category: 'opportunity',
    severity: 'low',
    title: `${pct1((standingCost / total) * 100)} of this bill is the standing charge`,
    detail:
      'At this usage level the tariff is mis-shaped: almost nothing is recovered through unit rates. The site is either too small for its contract, or there is a standby load nobody owns.',
    evidence: [
      { label: 'Standing charge cost', value: gbp(round2(standingCost)) },
      { label: 'Bill total', value: gbp(total) },
      { label: 'Unit charges', value: gbp(round2((kwh * rate) / 100)) },
    ],
    impactGbp: 0,
    confidence: 0.8,
    recommendation:
      'Model a fixed deal or a site-specific business tariff. If the site genuinely consumes this little, a standby-load survey will usually find something.',
    source: 'tariff-model',
  };
}
/** 7. Metering policy — is the site paying for resolution it does not have? */
function checkMetering(input: BillInput, site: Site | undefined, days: number | null): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const kwh = input.consumptionKwh;
  if (kwh === undefined || kwh <= 0) return findings;

  const annualised = Math.round((kwh * 365) / (days ?? 30.4));
  const meter = site?.meterType ?? 'unknown';

  if (annualised >= HH_METERING_KWH_PER_YEAR) {
    findings.push({
      code: 'half-hourly-required',
      category: 'metering',
      severity: 'medium',
      title: `At ${annualised.toLocaleString('en-GB')} kWh/yr this site should be on half-hourly metering`,
      detail:
        'The Balancing and Settlement Licence requires HH metering for non-domestic sites at or above 250,000 kWh a year. HH gives 48 readings a day, which unlocks tariff optimisation, flexibility revenue and accurate settlement.',
      evidence: [
        { label: 'Annualised usage', value: `${annualised.toLocaleString('en-GB')} kWh` },
        { label: 'BAL threshold', value: `${HH_METERING_KWH_PER_YEAR.toLocaleString('en-GB')} kWh/yr` },
        { label: 'Current meter', value: meter },
      ],
      impactGbp: 0,
      confidence: 0.7,
      recommendation:
        'Request an HH installation quote and compare it against the optimisation and flexibility value it unlocks.',
      source: 'metering-policy',
    });
  } else if (annualised < SMALL_SITE_KWH_PER_YEAR && meter !== 'Smart' && meter !== 'Half-hourly') {
    findings.push({
      code: 'site-too-small-for-contract',
      category: 'opportunity',
      severity: 'info',
      title: `${annualised.toLocaleString('en-GB')} kWh/yr is a small site — price it as one`,
      detail:
        'Below roughly 15,000 kWh a year, business contracts and standing charges dominate. A fixed tariff with no exit fee usually beats anything variable.',
      evidence: [
        { label: 'Annualised usage', value: `${annualised.toLocaleString('en-GB')} kWh/yr` },
        { label: 'Current meter', value: meter },
      ],
      impactGbp: 0,
      confidence: 0.6,
      recommendation: 'Model a fixed tariff with no exit fee and compare it against the current contract.',
      source: 'tariff-model',
    });
  }

  return findings;
}

/** 8. Would time-of-use pricing beat the current flat rate? */
function checkTimeOfUse(input: BillInput): AnalysisFinding | null {
  const { unitRateP: rate, consumptionKwh: kwh, nightShare } = input;
  if (rate === undefined || kwh === undefined || nightShare === undefined) return null;
  if (nightShare <= 0.02 || nightShare >= 0.95) return null;

  const blended = rate * (1 - nightShare * OFF_PEAK_DISCOUNT);
  const saving = round2(((rate - blended) * kwh) / 100);
  if (saving < TOU_MIN_SAVING_GBP) return null;

  return {
    code: 'time-of-use-opportunity',
    category: 'opportunity',
    severity: 'low',
    title: 'Shifting load into off-peak windows could cut the energy charge',
    detail: `${pct1(nightShare * 100)} of this site's usage already falls outside peak hours. On a dual-rate tariff that is worth about ${gbp(saving)} a period before any schedule changes are made.`,
    evidence: [
      { label: 'Off-peak share', value: pct1(nightShare * 100) },
      { label: 'Current unit rate', value: `${rate.toFixed(2)}p/kWh` },
      { label: 'Modelled blended rate', value: `${blended.toFixed(2)}p/kWh` },
    ],
    impactGbp: -saving,
    confidence: 0.5,
    recommendation:
      'Confirm the tariff supports dual-rate metering, then shift refrigeration, defrost and EV charging into the off-peak block from the Optimiser.',
    source: 'tariff-model',
  };
}
// ── Entry points ───────────────────────────────────────────────────────────────

/**
 * Run the full engine over one bill. `site` is optional — pass it when the bill
 * is linked to a site so the baseline and metering checks can run.
 */
export function analyseBill(input: BillInput, site?: Site): BillAnalysis {
  const days = periodDays(input);
  const resolved = resolveRegion(site?.region, site?.postcode);
  const findings: AnalysisFinding[] = [];

  if (resolved) {
    const rateFinding = checkUnitRate(input, resolved.region, resolved.estimated);
    if (rateFinding) findings.push(rateFinding);
    const scFinding = checkStandingCharge(input, resolved.region, days);
    if (scFinding) findings.push(scFinding);
  }

  const arithmetic = checkArithmetic(input, days);
  if (arithmetic) findings.push(arithmetic);
  const vat = checkVat(input);
  if (vat) findings.push(vat);
  const consumption = checkConsumption(input, site, days);
  if (consumption) findings.push(consumption);
  const dominance = checkStandingChargeDominance(input, days);
  if (dominance) findings.push(dominance);
  findings.push(...checkMetering(input, site, days));
  const tou = checkTimeOfUse(input);
  if (tou) findings.push(tou);

  const capPeriod = capPeriodForDate(input.periodStart ?? new Date().toISOString());
  const chargedDays = days ?? 31;
  const expectedTotalGbp =
    input.consumptionKwh !== undefined && input.unitRateP !== undefined
      ? round2(
          (input.consumptionKwh * input.unitRateP) / 100 +
            ((input.standingChargeP ?? 0) * chargedDays) / 100,
        )
      : null;
  const effectiveRateP =
    input.totalGbp !== undefined && input.consumptionKwh !== undefined && input.consumptionKwh > 0
      ? round2((input.totalGbp * 100) / input.consumptionKwh)
      : null;

  // The "what should this have cost?" benchmark: the same consumption priced at
  // the published reference rate — the site's own Ofgem region when we know it,
  // otherwise the GB average. This is the number the acquisition flow quotes as
  // the median UK bill rate ("you paid £500, the UK median says £400").
  const reference = resolved
    ? {
        label: `${resolved.region.name} Ofgem cap`,
        unitRateP: unitRateFor(resolved.region, input.paymentMethod ?? 'direct-debit'),
        standingChargeP: resolved.region.standingChargeP,
      }
    : {
        label: 'GB average Ofgem cap',
        unitRateP: capPeriod.averageUnitRateP,
        standingChargeP: capPeriod.averageStandingChargeP,
      };
  const benchmarkExpectedGbp =
    input.consumptionKwh !== undefined
      ? round2(
          (input.consumptionKwh * reference.unitRateP) / 100 +
            (reference.standingChargeP * chargedDays) / 100,
        )
      : null;
  const actualTotalGbp = input.totalGbp ?? expectedTotalGbp;
  const benchmarkSavingGbp =
    benchmarkExpectedGbp !== null && actualTotalGbp !== null
      ? round2(actualTotalGbp - benchmarkExpectedGbp)
      : null;
  const benchmark: BillBenchmark = {
    label: reference.label,
    unitRateP: reference.unitRateP,
    standingChargeP: reference.standingChargeP,
    consumptionKwh: input.consumptionKwh ?? null,
    periodDays: chargedDays,
    expectedTotalGbp: benchmarkExpectedGbp,
    actualTotalGbp: actualTotalGbp ?? null,
    savingGbp: benchmarkSavingGbp,
    savingPct:
      benchmarkSavingGbp !== null && actualTotalGbp
        ? round2((benchmarkSavingGbp / actualTotalGbp) * 100)
        : null,
  };

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return {
    score: Math.max(0, 100 - penalty),
    findings: findings.sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        Math.abs(b.impactGbp) - Math.abs(a.impactGbp),
    ),
    recoverableGbp: round2(findings.reduce((sum, f) => sum + Math.max(0, f.impactGbp), 0)),
    periodDays: days,
    expectedTotalGbp,
    effectiveRateP,
    region: resolved
      ? { id: resolved.region.id, name: resolved.region.name, estimated: resolved.estimated }
      : null,
    capPeriod: {
      id: capPeriod.id,
      label: capPeriod.label,
      averageUnitRateP: capPeriod.averageUnitRateP,
      electricityVatPct: capPeriod.electricityVatPct,
    },
    benchmark,
  };
}

/** Roll per-bill findings up to a per-site risk view for the dashboard. */
export function assessPortfolio(
  sites: Site[],
  entries: { siteId?: string; analysis: BillAnalysis }[],
): SiteRisk[] {
  const bySite = new Map<string, BillAnalysis[]>();
  for (const { siteId, analysis } of entries) {
    if (!siteId) continue;
    const bucket = bySite.get(siteId);
    if (bucket) bucket.push(analysis);
    else bySite.set(siteId, [analysis]);
  }

  return sites.map((site) => {
    const related = (bySite.get(site.id) ?? []).filter((a) => a.findings.length > 0);
    const penalty = related.reduce((sum, a) => sum + (100 - a.score) * 0.2, 0);
    const codes = [...new Set(related.flatMap((a) => a.findings.map((f) => f.code)))];
    return {
      siteId: site.id,
      name: site.name,
      score: Math.max(0, Math.round(100 - penalty)),
      flaggedInvoices: related.length,
      recoverableGbp: round2(related.reduce((sum, a) => sum + a.recoverableGbp, 0)),
      annualisedKwh: Math.round((site.monthActual * 365) / 30.4),
      topCodes: codes.slice(0, 3),
    };
  });
}