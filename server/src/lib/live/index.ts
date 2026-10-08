/**
 * The live UK energy-data layer — one entry point the API routes call.
 *
 * `getLiveTariffSnapshot()` resolves the customer's region (from an explicit
 * region, or a postcode via the same cap-region heuristic the bill engine uses),
 * fetches the real half-hourly Agile curve for today and tomorrow, and reduces it
 * to the numbers the product needs: the price right now, the cheap and expensive
 * windows, and the shift plan that turns them into £.
 *
 * Nothing here throws. Missing feeds surface as `notes` on the snapshot.
 */

import { regionForPostcode } from '../priceCap.js';
import { toOctopusRegion } from './regions.js';
import { fetchAgileTariff } from './octopus.js';
import { fetchCarbonForecast } from './carbon.js';
import {
  cheapestWindows,
  priceStats,
  priciestWindows,
  rateAt,
} from './derive.js';
import type {
  HalfHourlyRate,
  LiveSnapshot,
  LiveTariffSnapshot,
  PriceWindow,
} from './types.js';

const londonDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` for an instant, in the UK's local timezone. */
export function londonDayKey(iso: string | Date): string {
  return londonDate.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** Resolve the Octopus region letter for a site: explicit region → postcode → default. */
export function resolveLiveRegion(options: {
  region?: string;
  postcode?: string;
}): { region: string | undefined; via: 'explicit' | 'postcode' | 'default' } {
  const explicit = toOctopusRegion(options.region);
  if (explicit) return { region: explicit, via: 'explicit' };
  if (options.postcode) {
    const cap = regionForPostcode(options.postcode);
    const fromPostcode = cap ? toOctopusRegion(cap.id) : undefined;
    if (fromPostcode) return { region: fromPostcode, via: 'postcode' };
  }
  return { region: undefined, via: 'default' };
}

/** Rates whose settlement period starts on the UK "today" or "tomorrow". */
function horizonRates(rates: HalfHourlyRate[]): HalfHourlyRate[] {
  const now = new Date();
  const today = londonDayKey(now);
  const tomorrow = londonDayKey(new Date(now.getTime() + 86_400_000));
  return rates.filter((r) => {
    const key = londonDayKey(r.validFrom);
    return key === today || key === tomorrow;
  });
}

export interface LiveTariffOptions {
  region?: string;
  postcode?: string;
  product?: string;
  /** Duration of the windows ranked as cheapest/priciest, hours. Default 3. */
  windowHours?: number;
}

export async function getLiveTariffSnapshot(
  options: LiveTariffOptions = {},
): Promise<LiveTariffSnapshot | null> {
  const { region } = resolveLiveRegion(options);
  // Fetch a generous window around now so the UK "today/tomorrow" horizon is
  // always fully covered, whatever the local date is.
  const now = Date.now();
  const result = await fetchAgileTariff({
    region,
    product: options.product,
    from: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
    to: new Date(now + 30 * 60 * 60 * 1000).toISOString(),
  });

  if (!result.ok) return null;

  const { rates } = result.data;
  const horizon = horizonRates(rates);
  const effective = horizon.length > 0 ? horizon : rates;
  const windowHours = options.windowHours && options.windowHours > 0 ? options.windowHours : 3;

  const cheapest: PriceWindow[] = cheapestWindows(effective, windowHours, 3);
  const priciest: PriceWindow[] = priciestWindows(effective, windowHours, 3);

  return {
    region: result.data.region,
    regionName: result.data.regionName,
    productCode: result.data.productCode,
    tariffCode: result.data.tariffCode,
    standingChargeP: result.data.standingChargeP,
    source: result.source,
    fetchedAt: result.fetchedAt,
    cached: result.cached,
    rates: effective,
    stats: priceStats(effective),
    current: rateAt(rates, new Date().toISOString()),
    cheapest,
    priciest,
    windowStart: effective[0]?.validFrom ?? null,
    windowEnd: effective[effective.length - 1]?.validTo ?? null,
  };
}

export async function getLiveSnapshot(
  options: LiveTariffOptions = {},
): Promise<LiveSnapshot> {
  const [tariff, carbon] = await Promise.all([
    getLiveTariffSnapshot(options),
    fetchCarbonForecast(),
  ]);

  const notes: string[] = [];
  if (!tariff) {
    notes.push('The live half-hourly price feed could not be reached.');
  }
  if (!carbon.ok) {
    notes.push(carbon.error);
  }

  return {
    tariff,
    carbon: carbon.ok
      ? { current: carbon.data.current, forecast: carbon.data.forecast, source: carbon.source }
      : null,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

export type { LiveSnapshot, LiveTariffSnapshot } from './types.js';
