/**
 * Whole-site live energy flow — the model behind the "Energy Flow Diagram".
 *
 * The dashboard the product is measured against (1app.energy) shows one radial
 * picture of a home: solar, battery, grid, EV and load, live, with the money
 * underneath. EnerOS needs the same picture for a *site* — a restaurant's HVAC,
 * refrigeration and kitchen instead of a house's heat pump.
 *
 * WHAT IS REAL AND WHAT IS MODELLED. This is the honest split, and it is the
 * same discipline the rest of the app follows:
 *   • REAL — the half-hourly prices, the export rate and the carbon intensity
 *     all come from the live feeds (`octopus.ts`, `carbon.ts`). Every £ figure
 *     here is computed from those real prices.
 *   • MODELLED — the instantaneous kW at each asset. EnerOS has no device
 *     telemetry yet (that is Phase 3), so load, solar, battery and EV are
 *     generated deterministically from the site's own data: its type, its
 *     controllable loads, its monthly spend. Nothing is random — the same site
 *     at the same time always produces the same picture, which is what makes it
 *     testable.
 *
 * The energy balance is enforced, not decorative:
 *   grid = load + ev + batteryCharge − solar − batteryDischarge
 * so the flow diagram adds up even though the inputs are modelled.
 */

import type { HalfHourlyRate } from './types.js';
import { rateAt } from './derive.js';

export interface FlowSite {
  id: string;
  name: string;
  type: string;
  loads: string[];
  /** Current-period spend, GBP. Used to scale the site's consumption. */
  monthActual: number;
}

export interface FlowAssets {
  hasSolar: boolean;
  hasBattery: boolean;
  hasEv: boolean;
  /** Installed solar capacity, kWp. */
  solarKwp: number;
  /** Battery capacity, kWh. */
  batteryKwh: number;
  /** Number of charge points. */
  evChargers: number;
}

export interface FlowNode {
  key: 'solar' | 'battery' | 'grid' | 'ev' | 'load';
  label: string;
  /** kW, absolute. */
  valueKw: number;
  /** Short value shown on the node, e.g. "2.5 kW" or "0 W". */
  valueLabel: string;
  /** Direction of flow at this instant. */
  direction: 'in' | 'out' | 'idle';
  /** Extra line under the value, e.g. "1 × 16.1 kWh". */
  sublabel: string;
}

export interface FlowHistoryPoint {
  t: string;
  solar: number;
  grid: number;
  load: number;
  battery: number;
  ev: number;
}

export interface SiteFlow {
  siteId: string;
  siteName: string;
  updatedAt: string;
  mode: 'import' | 'export';
  /** The central hub: net import or net export, kW. */
  central: { mode: 'import' | 'export'; valueKw: number; label: string };
  nodes: FlowNode[];
  totals: {
    solarKwh: number;
    gridImportKwh: number;
    gridExportKwh: number;
    batteryChargedKwh: number;
    batteryDischargedKwh: number;
    loadKwh: number;
    evKwh: number;
  };
  tariff: {
    name: string;
    importP: number;
    exportP: number;
    standingP: number;
    offPeak: boolean;
  };
  cost: {
    importGbp: number;
    exportGbp: number;
    standingGbp: number;
    /** Import − export + standing. Negative means the site was paid. */
    netGbp: number;
  };
  history: FlowHistoryPoint[];
  assets: FlowAssets;
  /** True when at least one live price was used; false = modelled-only. */
  pricedFromLive: boolean;
  notes: string[];
}
// ── Tunables ───────────────────────────────────────────────────────────────────

const HALF_HOUR_H = 0.5;
/** UK October generation factor: kWh per kWp per day on a clear-ish day. */
const SOLAR_KWH_PER_KWP = 2.3;
/** Fraction of a site's daily consumption a solar array is sized to offset. */
const SOLAR_SHARE_OF_LOAD = 0.18;
/** Battery round-trip efficiency, applied on the way in. */
const BATTERY_EFFICIENCY = 0.92;
const BATTERY_POWER_KW = 5;
/** Fraction of daily consumption that goes to EV charging where chargers exist. */
const EV_SHARE_OF_LOAD = 0.16;
const EV_POWER_PER_CHARGER_KW = 7.4;
const EV_CHARGE_HOURS = 4;
/** Physical caps: an on-site array and battery are roof/plant-limited, not
 *  proportional to consumption. Without these a large site models a power
 *  station on its roof. */
const MAX_SOLAR_KWP = 50;
const MAX_BATTERY_KWH = 100;
const MAX_EV_CHARGERS = 8;

/** kW → a short label matching the reference: "2.5 kW" / "823 W" / "0 W". */
function kwLabel(kw: number): string {
  if (!Number.isFinite(kw) || kw <= 0.001) return '0 W';
  if (kw < 1) return `${Math.round(kw * 1000)} W`;
  return `${kw.toFixed(1)} kW`;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** UK local hour-of-day for an instant (fractional). */
function londonHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour + minute / 60;
}

/**
 * Relative electrical-load shape by site type. Not normalised here; the caller
 * scales it so the day sums to the site's modelled daily kWh.
 */
function loadWeight(siteType: string, hour: number): number {
  const between = (a: number, b: number): boolean => hour >= a && hour < b;
  switch (siteType) {
    case 'Restaurant':
      if (hour < 6) return 0.25;
      if (between(6, 11)) return 0.7;
      if (between(11, 15)) return 1.35;
      if (between(15, 17)) return 0.9;
      if (between(17, 22)) return 1.5;
      return 0.5;
    case 'Café':
      if (hour < 6) return 0.2;
      if (between(6, 11)) return 1.4;
      if (between(11, 15)) return 1.25;
      if (between(15, 19)) return 0.7;
      return 0.2;
    case 'Bakery':
      if (between(2, 8)) return 1.6; // ovens overnight
      if (between(8, 13)) return 0.9;
      if (between(13, 18)) return 0.7;
      return 0.35;
    case 'Pub':
      if (hour < 11) return 0.3;
      if (between(11, 16)) return 0.7;
      if (between(16, 23)) return 1.5;
      return 0.6;
    case 'Hotel':
      if (between(6, 10)) return 1.3;
      if (between(10, 17)) return 0.8;
      if (between(17, 22)) return 1.4;
      return 0.5;
    case 'Food Production':
      if (between(5, 22)) return 1.25;
      return 0.5;
    case 'Retail':
      if (between(8, 20)) return 1.3;
      return 0.45;
    default:
      if (between(7, 21)) return 1.1;
      return 0.4;
  }
}

/** Solar generation weight — a daylight bell, zero outside 06:00–19:00. */
function solarWeight(hour: number): number {
  if (hour < 6 || hour > 19) return 0;
  return Math.max(0, Math.sin((Math.PI * (hour - 6)) / 13));
}

/** UK local midnight for the day containing `at`, as a UTC epoch millisecond. */
function londonDayStartMs(at: Date): number {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const offsetMinutes = (asUtc - at.getTime()) / 60_000;
  return Date.parse(`${ymd}T00:00:00Z`) - offsetMinutes * 60_000;
}

/** Infer installed assets from the site's discovered controllable loads. */
export function inferAssets(site: FlowSite, dailyLoadKwh: number): FlowAssets {
  const has = (needle: string): boolean =>
    site.loads.some((l) => l.toLowerCase().includes(needle.toLowerCase()));
  const hasSolar = has('solar') || has('pv');
  const hasEv = has('ev') || has('charger');
  const rawBattery = site.loads.find((l) => l.toLowerCase().includes('battery'));
  const hasBattery = Boolean(rawBattery);

  const solarKwp = hasSolar
    ? clamp(round((dailyLoadKwh * SOLAR_SHARE_OF_LOAD) / SOLAR_KWH_PER_KWP, 1), 4, MAX_SOLAR_KWP)
    : 0;
  const batteryKwh = hasBattery
    ? clamp(Math.round(dailyLoadKwh * 0.35 * 2) / 2, 5, MAX_BATTERY_KWH)
    : 0;
  const evChargers = hasEv ? clamp(Math.round(dailyLoadKwh / 300), 1, MAX_EV_CHARGERS) : 0;

  return { hasSolar, hasBattery, hasEv, solarKwp, batteryKwh, evChargers };
}

/** The cheapest contiguous run of `hours` inside `prices`, by index. */
function cheapestWindowIndices(prices: number[], hours: number): Set<number> {
  const span = Math.max(1, Math.round(hours / HALF_HOUR_H));
  const chosen = new Set<number>();
  if (prices.length < span || span === 0) return chosen;
  let bestStart = 0;
  let bestSum = Number.POSITIVE_INFINITY;
  for (let i = 0; i + span <= prices.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < span; j += 1) sum += prices[i + j];
    if (sum < bestSum) {
      bestSum = sum;
      bestStart = i;
    }
  }
  for (let j = 0; j < span; j += 1) chosen.add(bestStart + j);
  return chosen;
}

/**
 * Build the whole-site flow for one day, priced from the live curve.
 *
 * Deterministic: the same site, curve and `nowIso` always produce the same
 * picture, which is what lets `verify:live` assert on it offline.
 */
export function buildSiteFlow(input: {
  site: FlowSite;
  importRates: HalfHourlyRate[];
  exportRates?: HalfHourlyRate[];
  standingChargeP: number;
  tariffName: string;
  /** Live export credit, p/kWh, when known. */
  exportRateP?: number;
  nowIso: string;
}): SiteFlow {
  const { site, importRates, exportRates, standingChargeP, tariffName, nowIso } = input;
  const now = new Date(nowIso);
  const notes: string[] = [];

  const prices = importRates.map((r) => r.unitRateP);
  const meanP = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 26.32;
  const sorted = [...prices].sort((a, b) => a - b);
  const pick = (q: number): number =>
    sorted.length === 0 ? meanP : sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  const p25 = pick(0.25);
  const p75 = pick(0.75);

  // Site scale: monthly spend ÷ the live price gives the site's consumption.
  const monthlyKwh = site.monthActual > 0 ? site.monthActual / (meanP / 100) : 0;
  const dailyLoadKwh = Math.max(0, monthlyKwh / 30.4);
  const assets = inferAssets(site, dailyLoadKwh);

  // 48 half-hourly slots across the UK "today".
  const dayStart = londonDayStartMs(now);
  const slots = Array.from({ length: 48 }, (_, i) => dayStart + i * 30 * 60_000);
  const slotPrice = slots.map((t) => {
    const rate = rateAt(importRates, new Date(t).toISOString());
    return rate ? rate.unitRateP : meanP;
  });
  const pricedFromLive = slots.some((t) => rateAt(importRates, new Date(t).toISOString()) !== null);
  if (!pricedFromLive) {
    notes.push('No live prices covered today — costs use the day-mean rate.');
  }

  // Normalise the load shape so the day sums to the modelled daily kWh.
  const rawLoad = slots.map((t) => loadWeight(site.type, londonHour(new Date(t).toISOString())));
  const loadSum = rawLoad.reduce((a, b) => a + b, 0) || 1;
  const loadKw = rawLoad.map((w) => (w / loadSum) * (dailyLoadKwh / HALF_HOUR_H));

  // Solar.
  const rawSolar = slots.map((t) => solarWeight(londonHour(new Date(t).toISOString())));
  const solarSum = rawSolar.reduce((a, b) => a + b, 0) || 1;
  const solarDayKwh = assets.solarKwp * SOLAR_KWH_PER_KWP;
  const solarKw = assets.hasSolar
    ? rawSolar.map((w) => (w / solarSum) * (solarDayKwh / HALF_HOUR_H))
    : slots.map(() => 0);

  // EV — charged in the cheapest window of the day, which is the whole point.
  const evKw = slots.map(() => 0);
  if (assets.hasEv && dailyLoadKwh > 0) {
    const evDayKwh = dailyLoadKwh * EV_SHARE_OF_LOAD;
    const winning = cheapestWindowIndices(slotPrice, EV_CHARGE_HOURS);
    const perSlot = Math.min(
      evDayKwh / Math.max(1, winning.size),
      assets.evChargers * EV_POWER_PER_CHARGER_KW * HALF_HOUR_H,
    );
    winning.forEach((i) => {
      evKw[i] = perSlot / HALF_HOUR_H;
    });
  }

  // Battery + grid balance.
  const chargeKw = slots.map(() => 0);
  const dischargeKw = slots.map(() => 0);
  let soc = assets.batteryKwh * 0.4;
  for (let i = 0; i < slots.length; i += 1) {
    if (!assets.hasBattery) break;
    const surplus = solarKw[i] - loadKw[i] - evKw[i];
    const headroom = assets.batteryKwh - soc;
    if (surplus > 0.15 && headroom > 0.1) {
      // Absorb the solar surplus first — free energy.
      const kw = Math.min(surplus, BATTERY_POWER_KW, headroom / (HALF_HOUR_H * BATTERY_EFFICIENCY));
      chargeKw[i] = kw;
      soc += kw * HALF_HOUR_H * BATTERY_EFFICIENCY;
    } else if (slotPrice[i] <= p25 && headroom > 0.1) {
      // Cheap half-hour: top up from the grid.
      const kw = Math.min(BATTERY_POWER_KW, headroom / (HALF_HOUR_H * BATTERY_EFFICIENCY));
      chargeKw[i] = kw;
      soc += kw * HALF_HOUR_H * BATTERY_EFFICIENCY;
    } else if (slotPrice[i] >= p75 && soc > assets.batteryKwh * 0.15) {
      // Expensive half-hour: shave the peak.
      const kw = Math.min(BATTERY_POWER_KW, loadKw[i] + evKw[i], soc / (HALF_HOUR_H * BATTERY_EFFICIENCY));
      dischargeKw[i] = kw;
      soc -= kw * HALF_HOUR_H;
    }
  }

  const gridKw = slots.map(
    (_, i) => loadKw[i] + evKw[i] + chargeKw[i] - solarKw[i] - dischargeKw[i],
  );

  const exportRateFallback = input.exportRateP ?? meanP * 0.45;
  const exportRate = input.exportRateP ?? (exportRates && exportRates.length > 0 ? meanOf(exportRates) : exportRateFallback);

  let importGbp = 0;
  let exportGbp = 0;
  const sum = (arr: number[]): number => arr.reduce((a, b) => a + b * HALF_HOUR_H, 0);
  for (let i = 0; i < slots.length; i += 1) {
    const kwh = Math.abs(gridKw[i]) * HALF_HOUR_H;
    if (gridKw[i] >= 0) importGbp += (kwh * slotPrice[i]) / 100;
    else exportGbp += (kwh * exportRate) / 100;
  }
  const standingGbp = standingChargeP / 100;

  // Current instant.
  const idx = Math.max(
    0,
    Math.min(slots.length - 1, Math.floor((now.getTime() - dayStart) / (30 * 60_000))),
  );
  const gc = gridKw[idx];
  const mode: 'import' | 'export' = gc < 0 ? 'export' : 'import';
  const currentPrice = slotPrice[idx];

  const nodes: FlowNode[] = [
    {
      key: 'ev',
      label: 'EV',
      valueKw: round(evKw[idx]),
      valueLabel: kwLabel(evKw[idx]),
      direction: evKw[idx] > 0 ? 'in' : 'idle',
      sublabel: assets.hasEv ? `${assets.evChargers} charger${assets.evChargers === 1 ? '' : 's'}` : 'no chargers',
    },
    {
      key: 'battery',
      label: 'Battery',
      valueKw: round(chargeKw[idx] - dischargeKw[idx]),
      valueLabel: kwLabel(Math.abs(chargeKw[idx] - dischargeKw[idx])),
      direction: chargeKw[idx] > 0 ? 'in' : dischargeKw[idx] > 0 ? 'out' : 'idle',
      sublabel: assets.hasBattery ? `${round(soc, 1)} kWh stored` : 'not installed',
    },
    {
      key: 'grid',
      label: 'Grid',
      valueKw: round(Math.abs(gc)),
      valueLabel: kwLabel(Math.abs(gc)),
      direction: gc < 0 ? 'out' : 'in',
      sublabel: mode === 'export' ? 'exporting' : 'importing',
    },
    {
      key: 'solar',
      label: 'Solar',
      valueKw: round(solarKw[idx]),
      valueLabel: kwLabel(solarKw[idx]),
      direction: solarKw[idx] > 0 ? 'out' : 'idle',
      sublabel: assets.hasSolar ? `${assets.solarKwp} kWp` : 'not installed',
    },
    {
      key: 'load',
      label: 'Site load',
      valueKw: round(loadKw[idx] + evKw[idx]),
      valueLabel: kwLabel(loadKw[idx] + evKw[idx]),
      direction: 'in',
      sublabel: site.type,
    },
  ];

  const history: FlowHistoryPoint[] = slots.map((t, i) => ({
    t: new Date(t).toISOString(),
    solar: round(solarKw[i]),
    grid: round(gridKw[i]),
    load: round(loadKw[i] + evKw[i]),
    battery: round(chargeKw[i] - dischargeKw[i]),
    ev: round(evKw[i]),
  }));

  return {
    siteId: site.id,
    siteName: site.name,
    updatedAt: now.toISOString(),
    mode,
    central: {
      mode,
      valueKw: round(Math.abs(gc)),
      label: mode === 'export' ? 'Export' : 'Import',
    },
    nodes,
    totals: {
      solarKwh: round(sum(solarKw), 1),
      gridImportKwh: round(slots.reduce((a, _, i) => a + Math.max(0, gridKw[i]) * HALF_HOUR_H, 0), 1),
      gridExportKwh: round(slots.reduce((a, _, i) => a + Math.max(0, -gridKw[i]) * HALF_HOUR_H, 0), 1),
      batteryChargedKwh: round(sum(chargeKw), 1),
      batteryDischargedKwh: round(sum(dischargeKw), 1),
      loadKwh: round(sum(loadKw), 1),
      evKwh: round(sum(evKw), 1),
    },
    tariff: {
      name: tariffName,
      importP: round(currentPrice, 2),
      exportP: round(exportRate, 2),
      standingP: round(standingChargeP, 2),
      offPeak: pricedFromLive && currentPrice <= p25,
    },
    cost: {
      importGbp: round(importGbp),
      exportGbp: round(exportGbp),
      standingGbp: round(standingGbp),
      netGbp: round(importGbp - exportGbp + standingGbp),
    },
    history,
    assets,
    pricedFromLive,
    notes,
  };
}

function meanOf(rates: HalfHourlyRate[]): number {
  if (rates.length === 0) return 0;
  return rates.reduce((sum, r) => sum + r.unitRateP, 0) / rates.length;
}
