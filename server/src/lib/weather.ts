/**
 * Weather normalisation via Elexon Insights — the public half-hourly temperature
 * feed (dataset `TEMP`), which reports air temperature at grid supply points.
 *
 * WHY THIS EXISTS: a restaurant's consumption rising 20% in January is normal and
 * a bakery's is not. Comparing a bill to the same site last month without
 * adjusting for temperature produces false anomalies in winter and misses real
 * ones in summer. Degree-day normalisation is what separates "the weather did
 * that" from "their chiller failed".
 *
 * Elexon's APIs are public and key-less:
 *   GET https://api.elexon.co.uk/insights/api/dataset/TEMP?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Availability is per half-hourly settlement period, so a single day needs 48
 * requests. We deliberately fetch only the window we need and fall back to
 * "unnormalised" whenever anything is missing — an analysis with no weather
 * adjustment is still useful; a silently wrong one is not.
 *
 * See docs/IMPLEMENTATION_GUIDE.md for the upgrade path to full HH metering.
 */

import { env } from '../env.js';

export interface WeatherSummary {
  /** Mean air temperature across the window, °C. */
  meanTempC: number | null;
  /** Temperature-weighted degree days over the window. */
  degreeDays: number | null;
  /** True when the caller can trust `degreeDays`. */
  normalised: boolean;
  /** Why normalisation was skipped, when it was. */
  note?: string;
}

interface TempRow {
  settlementDate?: string;
  settlementPeriod?: string;
  temperature?: string | number;
  gridSupplyPoint?: string;
}

/** Comfortable indoor balance point — below this, heating starts to cost. */
const BALANCE_POINT_C = 15.5;

const toCelsius = (value: number): number => value - 273.15;

/**
 * Mean temperature and degree days for a window. Never throws: on any upstream
 * problem it returns `{ normalised: false }` with a note.
 */
export async function fetchWeatherSummary(
  from: string,
  to: string,
): Promise<WeatherSummary> {
  const unresolved: WeatherSummary = {
    meanTempC: null,
    degreeDays: null,
    normalised: false,
    note: 'Temperature data unavailable — consumption compared without weather adjustment.',
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ...unresolved, note: 'Weather lookup needs ISO from/to dates.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs);
  try {
    const url = `${env.analysis.elexonBaseUrl}/dataset/TEMP?from=${from}&to=${to}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ...unresolved, note: `Elexon TEMP returned ${res.status}.` };
    }

    const payload = (await res.json()) as { data?: TempRow[] };
    const rows = payload.data ?? [];
    const readings = rows
      .map((row) => Number(row.temperature))
      .filter((t) => Number.isFinite(t) && t > 200); // kelvin, not a null marker

    if (readings.length === 0) {
      return { ...unresolved, note: 'No temperature readings returned for this window.' };
    }

    const mean = readings.reduce((sum, t) => sum + toCelsius(t), 0) / readings.length;
    // Each reading represents half an hour.
    const degreeDays = readings.reduce(
      (sum, t) => sum + Math.max(0, BALANCE_POINT_C - toCelsius(t)) * 0.5 / 24,
      0,
    );

    return {
      meanTempC: Math.round(mean * 10) / 10,
      degreeDays: Math.round(degreeDays * 10) / 10,
      normalised: true,
    };
  } catch {
    return unresolved;
  } finally {
    clearTimeout(timer);
  }
}