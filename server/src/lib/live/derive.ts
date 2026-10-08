/**
 * Pure derivations over a half-hourly price curve.
 *
 * Kept free of I/O and of `Date.now()` so every function is deterministic and
 * testable — this is what `verify-live.ts` exercises offline. The optimisation
 * *decisions* live here (which window is cheapest, what a shift saves); the
 * providers only fetch. That keeps the same "engine decides" discipline the bill
 * auditor uses.
 */

import type { HalfHourlyRate, PriceStats, PriceWindow, ShiftPlan } from './types.js';

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const ms = (iso: string): number => Date.parse(iso);

/** The rate covering `atIso`, or the next one starting after it. */
export function rateAt(rates: HalfHourlyRate[], atIso: string): HalfHourlyRate | null {
  if (rates.length === 0) return null;
  const at = ms(atIso);
  for (const rate of rates) {
    if (ms(rate.validFrom) <= at && at < ms(rate.validTo)) return rate;
  }
  // Between publications: fall back to the next period that starts after `at`.
  const next = rates.find((rate) => ms(rate.validFrom) > at);
  return next ?? null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function priceStats(rates: HalfHourlyRate[]): PriceStats {
  if (rates.length === 0) {
    return {
      count: 0,
      minUnitRateP: 0,
      maxUnitRateP: 0,
      meanUnitRateP: 0,
      medianUnitRateP: 0,
      p25UnitRateP: 0,
      p75UnitRateP: 0,
      cheapShare: 0,
    };
  }
  const prices = rates.map((r) => r.unitRateP).sort((a, b) => a - b);
  const sum = prices.reduce((total, p) => total + p, 0);
  const p25 = percentile(prices, 0.25);
  return {
    count: prices.length,
    minUnitRateP: round(prices[0]),
    maxUnitRateP: round(prices[prices.length - 1]),
    meanUnitRateP: round(sum / prices.length),
    medianUnitRateP: round(percentile(prices, 0.5)),
    p25UnitRateP: round(p25),
    p75UnitRateP: round(percentile(prices, 0.75)),
    cheapShare: round(prices.filter((p) => p <= p25 + 1e-9).length / prices.length, 3),
  };
}

/** Build a window descriptor from a run of consecutive periods. */
function windowFrom(run: HalfHourlyRate[]): PriceWindow {
  const prices = run.map((r) => r.unitRateP);
  const avg = prices.reduce((total, p) => total + p, 0) / prices.length;
  return {
    from: run[0].validFrom,
    to: run[run.length - 1].validTo,
    periods: run.length,
    hours: round(run.length / 2, 1),
    avgUnitRateP: round(avg),
    minUnitRateP: round(Math.min(...prices)),
    maxUnitRateP: round(Math.max(...prices)),
  };
}

/**
 * Contiguous windows of `durationHours`, ranked. Windows are assumed to be
 * consecutive periods in `rates`; a gap in the series ends a window rather than
 * spanning the missing data.
 */
function rankWindows(
  rates: HalfHourlyRate[],
  durationHours: number,
  count: number,
  direction: 'cheapest' | 'priciest',
): PriceWindow[] {
  const span = Math.max(1, Math.round(durationHours * 2));
  if (rates.length < span) return [];

  const windows: PriceWindow[] = [];
  for (let i = 0; i + span <= rates.length; i += 1) {
    const run = rates.slice(i, i + span);
    // Reject windows that span a gap in the published series.
    let contiguous = true;
    for (let j = 1; j < run.length; j += 1) {
      if (ms(run[j].validFrom) !== ms(run[j - 1].validTo)) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;
    windows.push(windowFrom(run));
  }

  windows.sort((a, b) =>
    direction === 'cheapest'
      ? a.avgUnitRateP - b.avgUnitRateP
      : b.avgUnitRateP - a.avgUnitRateP,
  );

  // De-duplicate overlapping windows so the list reads as distinct options.
  const chosen: PriceWindow[] = [];
  for (const window of windows) {
    const overlaps = chosen.some(
      (c) => ms(window.from) < ms(c.to) && ms(c.from) < ms(window.to),
    );
    if (!overlaps) chosen.push(window);
    if (chosen.length >= count) break;
  }
  return chosen;
}

export function cheapestWindows(
  rates: HalfHourlyRate[],
  durationHours: number,
  count = 3,
): PriceWindow[] {
  return rankWindows(rates, durationHours, count, 'cheapest');
}

export function priciestWindows(
  rates: HalfHourlyRate[],
  durationHours: number,
  count = 3,
): PriceWindow[] {
  return rankWindows(rates, durationHours, count, 'priciest');
}

/**
 * The core flexibility calculation: move `kwh` of flexible load from the most
 * expensive window of `durationHours` to the cheapest one, and report the saving.
 * This is the arithmetic behind "Charge the EV fleet 01:00–04:00".
 */
export function planShift(
  rates: HalfHourlyRate[],
  kwh: number,
  durationHours: number,
  cycleDays = 30,
): ShiftPlan {
  const cheapest = cheapestWindows(rates, durationHours, 1)[0] ?? null;
  const priciest = priciestWindows(rates, durationHours, 1)[0] ?? null;

  if (!cheapest || !priciest) {
    return {
      kwh,
      durationHours,
      from: priciest,
      to: cheapest,
      savingGbpPerCycle: 0,
      savingGbpPerMonth: 0,
      gapP: 0,
    };
  }

  const gapP = round(priciest.avgUnitRateP - cheapest.avgUnitRateP);
  const savingPerCycle = (Math.max(0, gapP) * kwh) / 100;
  return {
    kwh,
    durationHours,
    from: priciest,
    to: cheapest,
    savingGbpPerCycle: round(savingPerCycle),
    savingGbpPerMonth: round(savingPerCycle * cycleDays),
    gapP,
  };
}

/**
 * Daily cost of a load that draws `kwhPerPeriod` in every period of `rates`
 * (used to price a flat base load against the live curve).
 */
export function curveCost(rates: HalfHourlyRate[], kwhPerPeriod: number): number {
  const total = rates.reduce((sum, r) => sum + (r.unitRateP * kwhPerPeriod) / 100, 0);
  return round(total);
}
