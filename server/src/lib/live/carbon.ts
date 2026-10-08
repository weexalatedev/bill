/**
 * NESO Carbon Intensity API — the live gCO2/kWh for GB electricity.
 *
 * Public and key-less (`https://api.carbonintensity.org.uk`). Carbon is a
 * *secondary* benefit in the EnerOS pitch (the plan is explicit: lead with money,
 * not carbon), but it is genuinely useful twice over:
 *   • it explains *why* a half-hour is cheap (high wind → low price → low carbon),
 *   • it gives the flexibility module a second signal to optimise against when a
 *     customer has a net-zero commitment.
 *
 * As with every provider here, failure is non-fatal: the caller gets `ok: false`.
 */

import { env } from '../../env.js';
import type { CarbonIntensityPoint, LiveResult } from './types.js';

const SOURCE = 'NESO Carbon Intensity API (api.carbonintensity.org.uk)';

interface RawPoint {
  from: string;
  to: string;
  intensity: { forecast: number | null; actual: number | null; index: string };
}

interface RawEnvelope {
  data: RawPoint[];
}

const mapPoint = (p: RawPoint): CarbonIntensityPoint => ({
  from: new Date(p.from).toISOString(),
  to: new Date(p.to).toISOString(),
  forecast: p.intensity?.forecast ?? null,
  actual: p.intensity?.actual ?? null,
  index: p.intensity?.index ?? 'unknown',
});

/** `2026-10-08T00:00Z` — the format the Carbon Intensity API expects. */
function apiStamp(date: Date): string {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/**
 * Current intensity plus the next 24 hours at half-hourly resolution. The first
 * point of the range is returned as `current` when it covers "now".
 */
export async function fetchCarbonForecast(): Promise<
  LiveResult<{ current: CarbonIntensityPoint | null; forecast: CarbonIntensityPoint[] }>
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.live.timeoutMs);
  try {
    const now = new Date();
    const from = new Date(Math.floor(now.getTime() / (30 * 60_000)) * 30 * 60_000);
    const to = new Date(from.getTime() + 24 * 60 * 60_000);
    const url = `${env.live.carbonBaseUrl}/intensity/${apiStamp(from)}/${apiStamp(to)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }
    const payload = (await res.json()) as RawEnvelope;
    const forecast = (payload.data ?? []).map(mapPoint);
    const nowMs = now.getTime();
    const current =
      forecast.find((p) => Date.parse(p.from) <= nowMs && nowMs < Date.parse(p.to)) ??
      forecast[0] ??
      null;

    return {
      ok: true,
      data: { current, forecast },
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return {
      ok: false,
      error: `Carbon intensity feed unavailable (${message}).`,
      source: SOURCE,
    };
  } finally {
    clearTimeout(timer);
  }
}
