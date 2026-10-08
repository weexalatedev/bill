/**
 * Shared types for the live UK energy-data layer.
 *
 * Every provider returns a `LiveResult<T>` rather than throwing, so the API can
 * always answer — a feed that is down degrades to `ok: false` with a human
 * explanation instead of a 500. This mirrors the "degrade gracefully" rule the
 * weather normaliser already follows.
 */

export interface LiveOk<T> {
  ok: true;
  data: T;
  /** Attribution line shown in the UI, e.g. "Octopus Energy public API". */
  source: string;
  /** When the value was fetched from upstream (not when it was served). */
  fetchedAt: string;
  /** True when this response was served from the in-process cache. */
  cached: boolean;
}

export interface LiveErr {
  ok: false;
  error: string;
  source: string;
}

export type LiveResult<T> = LiveOk<T> | LiveErr;

/** One half-hourly unit rate from the Agile Octopus tariff. */
export interface HalfHourlyRate {
  /** Inclusive ISO start of the settlement period (UTC). */
  validFrom: string;
  /** Exclusive ISO end of the settlement period (UTC). */
  validTo: string;
  /** p/kWh including VAT — the number a customer would actually be billed. */
  unitRateP: number;
  /** p/kWh excluding VAT. */
  unitRateExcVatP: number;
}

export interface AgileTariff {
  productCode: string;
  tariffCode: string;
  /** Octopus distribution region letter, A–P. */
  region: string;
  /** Human label for the region, e.g. "London". */
  regionName: string;
  /** Standing charge, p/day including VAT. */
  standingChargeP: number;
  /** Half-hourly rates, ascending by `validFrom`. */
  rates: HalfHourlyRate[];
}

export interface CarbonIntensityPoint {
  from: string;
  to: string;
  /** gCO2/kWh, actual or forecast where published. */
  forecast: number | null;
  actual: number | null;
  /** NESO's band label: very low · low · moderate · high · very high. */
  index: string;
}

/** A contiguous block of settlement periods, priced as an average. */
export interface PriceWindow {
  from: string;
  to: string;
  /** Number of half-hourly periods in the window. */
  periods: number;
  hours: number;
  /** Mean p/kWh across the window, including VAT. */
  avgUnitRateP: number;
  /** Total p/kWh if every period were at the window's cheapest rate. */
  minUnitRateP: number;
  maxUnitRateP: number;
}

export interface PriceStats {
  count: number;
  minUnitRateP: number;
  maxUnitRateP: number;
  meanUnitRateP: number;
  medianUnitRateP: number;
  /** 25th percentile — the "cheap" cut used to shade the chart. */
  p25UnitRateP: number;
  /** 75th percentile — the "peak" cut. */
  p75UnitRateP: number;
  /** Share of periods at or below p25, 0–1. */
  cheapShare: number;
}

/** Result of moving a flexible load from its priciest window to its cheapest. */
export interface ShiftPlan {
  kwh: number;
  durationHours: number;
  /** The expensive window the load currently occupies. */
  from: PriceWindow | null;
  /** The cheapest window to move it to. */
  to: PriceWindow | null;
  /** £ saved per cycle (one move). */
  savingGbpPerCycle: number;
  /** £ saved per 30-day month if the move happens daily. */
  savingGbpPerMonth: number;
  /** Mean price gap, p/kWh. */
  gapP: number;
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
  /** Half-hourly rates, ascending. */
  rates: HalfHourlyRate[];
  stats: PriceStats;
  /** The rate covering "now", or the next rate if now is between publications. */
  current: HalfHourlyRate | null;
  /** Cheapest contiguous windows over the fetched horizon. */
  cheapest: PriceWindow[];
  /** Most expensive contiguous windows — where flexible load should NOT run. */
  priciest: PriceWindow[];
  /** Horizon covered by `rates`. */
  windowStart: string | null;
  windowEnd: string | null;
}

export interface LiveSnapshot {
  tariff: LiveTariffSnapshot | null;
  carbon: {
    current: CarbonIntensityPoint | null;
    forecast: CarbonIntensityPoint[];
    source: string;
  } | null;
  /** Non-fatal notes about anything that could not be fetched. */
  notes: string[];
  generatedAt: string;
}
