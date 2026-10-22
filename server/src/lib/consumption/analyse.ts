/**
 * Half-hourly consumption analysis — the deterministic core of the savings
 * report. Pure: it takes a price summary and returns numbers, so every claim can
 * be recomputed and tested.
 *
 * It answers the questions a business actually asks:
 *   • What does this cost?         → cost at the live mean rate
 *   • Where is it wasted?          → overnight base load, anomalous days
 *   • Is it saving anything?       → baseline vs recent (only with enough days)
 */

import type { ConsumptionPoint } from './csv.js';

export interface PriceSummary {
  /** Mean unit rate, p/kWh, from the live curve (or the bill). */
  meanP: number;
}

export interface ConsumptionAnalysis {
  totalKwh: number;
  periods: number;
  days: number;
  avgDailyKwh: number;
  avgKw: number;
  peakKw: number;
  costGbp: number;
  overnightKwh: number;
  overnightAvgKw: number;
  overnightSharePct: number;
  loadShape: { period: number; hour: string; avgKw: number }[];
  anomalies: { date: string; overnightKw: number; vsMedianPct: number }[];
  baseline: {
    baselineDailyKwh: number;
    recentDailyKwh: number;
    savedPct: number;
    savedKwhPerDay: number;
    savedGbpPerMonth: number;
  } | null;
  alerts: { severity: 'info' | 'low' | 'medium' | 'high'; title: string; detail: string }[];
}

const round = (n: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const londonHour = (iso: string): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  return (
    Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24 +
    Number(parts.find((p) => p.type === 'minute')?.value ?? '0') / 60
  );
};

const dayKey = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

function emptyAnalysis(): ConsumptionAnalysis {
  return {
    totalKwh: 0,
    periods: 0,
    days: 0,
    avgDailyKwh: 0,
    avgKw: 0,
    peakKw: 0,
    costGbp: 0,
    overnightKwh: 0,
    overnightAvgKw: 0,
    overnightSharePct: 0,
    loadShape: Array.from({ length: 48 }, (_, i) => ({
      period: i,
      hour: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      avgKw: 0,
    })),
    anomalies: [],
    baseline: null,
    alerts: [],
  };
}

export function analyseConsumption(
  points: ConsumptionPoint[],
  prices: PriceSummary,
): ConsumptionAnalysis {
  if (points.length === 0) return emptyAnalysis();

  const totalKwh = points.reduce((sum, p) => sum + p.kwh, 0);
  const peakKw = Math.max(...points.map((p) => p.kwh * 2));
  const days = new Set(points.map((p) => dayKey(p.from))).size || 1;
  const avgDailyKwh = totalKwh / days;
  const avgKw = totalKwh / (points.length * 0.5);
  const costGbp = (totalKwh * prices.meanP) / 100;

  const overnight = points.filter((p) => londonHour(p.from) < 6);
  const overnightKwh = overnight.reduce((sum, p) => sum + p.kwh, 0);
  const overnightAvgKw = overnight.length > 0 ? overnightKwh / (overnight.length * 0.5) : 0;
  const overnightSharePct = totalKwh > 0 ? (overnightKwh / totalKwh) * 100 : 0;

  const slot = Array.from({ length: 48 }, () => ({ kw: 0, n: 0 }));
  for (const p of points) {
    const idx = Math.min(47, Math.floor((londonHour(p.from) / 24) * 48));
    slot[idx].kw += p.kwh * 2;
    slot[idx].n += 1;
  }
  const loadShape = slot.map((s, i) => ({
    period: i,
    hour: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
    avgKw: s.n > 0 ? round(s.kw / s.n) : 0,
  }));

  // Anomalous days: overnight base load well above the median day.
  const byDay = new Map<string, { kwh: number; n: number }>();
  for (const p of points) {
    if (londonHour(p.from) >= 6) continue;
    const key = dayKey(p.from);
    const cur = byDay.get(key) ?? { kwh: 0, n: 0 };
    cur.kwh += p.kwh;
    cur.n += 1;
    byDay.set(key, cur);
  }
  const dayOvernightKw = [...byDay.values()].map((d) => d.kwh / Math.max(1, d.n * 0.5));
  const sorted = [...dayOvernightKw].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const anomalies = [...byDay.entries()]
    .map(([date, d]) => {
      const kw = d.kwh / Math.max(1, d.n * 0.5);
      return {
        date,
        overnightKw: round(kw),
        vsMedianPct: median > 0 ? round(((kw - median) / median) * 100) : 0,
      };
    })
    .filter((x) => x.vsMedianPct > 30)
    .sort((a, b) => b.vsMedianPct - a.vsMedianPct)
    .slice(0, 5);

  // Baseline vs recent — only when there is enough history to be honest.
  let baseline: ConsumptionAnalysis['baseline'] = null;
  if (days >= 14) {
    const dailyMap = new Map<string, number>();
    for (const p of [...points].sort((a, b) => Date.parse(a.from) - Date.parse(b.from))) {
      const k = dayKey(p.from);
      dailyMap.set(k, (dailyMap.get(k) ?? 0) + p.kwh);
    }
    const daily = [...dailyMap.values()];
    const half = Math.floor(daily.length / 2);
    const firstAvg = daily.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
    const lastAvg = daily.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, daily.length - half);
    if (firstAvg > 0) {
      const savedKwhPerDay = firstAvg - lastAvg;
      baseline = {
        baselineDailyKwh: round(firstAvg),
        recentDailyKwh: round(lastAvg),
        savedPct: round((savedKwhPerDay / firstAvg) * 100),
        savedKwhPerDay: round(savedKwhPerDay),
        savedGbpPerMonth: round((savedKwhPerDay * 30 * prices.meanP) / 100, 2),
      };
    }
  }

  const alerts: ConsumptionAnalysis['alerts'] = [];
  if (overnightSharePct > 30) {
    alerts.push({
      severity: 'medium',
      title: 'High overnight base load',
      detail: `${round(overnightSharePct)}% of consumption happens overnight (00:00–06:00), when the site should be quiet. This usually points to equipment left running or a refrigeration fault.`,
    });
  }
  if (anomalies.length > 0) {
    alerts.push({
      severity: 'high',
      title: `${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} in overnight usage`,
      detail: `Overnight load on ${anomalies[0].date} was ${anomalies[0].vsMedianPct}% above the median day.`,
    });
  }

  return {
    totalKwh: round(totalKwh),
    periods: points.length,
    days,
    avgDailyKwh: round(avgDailyKwh),
    avgKw: round(avgKw),
    peakKw: round(peakKw),
    costGbp: round(costGbp, 2),
    overnightKwh: round(overnightKwh),
    overnightAvgKw: round(overnightAvgKw),
    overnightSharePct: round(overnightSharePct),
    loadShape,
    anomalies,
    baseline,
    alerts,
  };
}

