/**
 * Octopus Energy public tariff API — real half-hourly GB electricity prices.
 *
 * WHY THIS FEED: Agile Octopus is a real, published, half-hourly wholesale-linked
 * tariff. Octopus exposes it through a public REST API with **no key and no
 * account** (`https://api.octopus.energy/v1`). That makes it the single most
 * useful *real-time* UK price signal available to a product like EnerOS: it is
 * the actual p/kWh a business would be billed in each settlement period, for the
 * customer's own distribution region.
 *
 * It is not the customer's own tariff — it is a live market reference that lets
 * EnerOS price a shift ("move this load to the cheapest half-hours") and show a
 * real curve rather than a modelled one. Where a customer is genuinely on Agile,
 * it is exact.
 *
 * Everything degrades: any upstream problem returns `{ ok: false }` with a note,
 * never a throw. Responses are cached in-process (prices only change per half
 * hour; the horizon is published in daily batches).
 */

import { env } from '../../env.js';
import type { AgileTariff, HalfHourlyRate, LiveResult } from './types.js';
import { regionNameFor, toOctopusRegion, type OctopusRegionLetter } from './regions.js';

const SOURCE = 'Octopus Energy public tariff API (api.octopus.energy)';
const MAX_PAGES = 8;

interface CacheEntry<T> {
  at: number;
  value: LiveResult<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

function readCache<T>(key: string): CacheEntry<T> | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.at > env.live.cacheTtlMs) {
    cache.delete(key);
    return null;
  }
  return hit;
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.live.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface UnitRateRow {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string | null;
}

interface Paged<T> {
  count: number;
  next: string | null;
  results: T[];
}

function normaliseRate(row: UnitRateRow, fallbackTo: string | null): HalfHourlyRate {
  return {
    validFrom: new Date(row.valid_from).toISOString(),
    validTo: new Date(row.valid_to ?? fallbackTo ?? row.valid_from).toISOString(),
    unitRateP: row.value_inc_vat,
    unitRateExcVatP: row.value_exc_vat,
  };
}

export function agileTariffCode(productCode: string, region: OctopusRegionLetter): string {
  return `E-1R-${productCode}-${region}`;
}

/**
 * Fetch the Agile unit-rate curve for a region over a window. Follows Octopus's
 * pagination (`next`) so long horizons are complete.
 */
export async function fetchAgileTariff(options: {
  region?: string;
  product?: string;
  from: string;
  to: string;
}): Promise<LiveResult<AgileTariff>> {
  const region = toOctopusRegion(options.region) ?? toOctopusRegion(env.live.agileRegion) ?? 'C';
  const product = options.product ?? env.live.agileProduct;
  const tariffCode = agileTariffCode(product, region);
  const key = `agile:${tariffCode}:${options.from}:${options.to}`;

  const cached = readCache<AgileTariff>(key);
  if (cached) {
    return cached.value.ok ? { ...cached.value, cached: true } : cached.value;
  }

  const base = `${env.live.octopusBaseUrl}/products/${product}/electricity-tariffs/${tariffCode}`;
  const fromIso = new Date(options.from).toISOString();
  const toIso = new Date(options.to).toISOString();

  try {
    const firstUrl = `${base}/standard-unit-rates/?period_from=${fromIso}&period_to=${toIso}&page_size=100`;
    const [firstPage, standing] = await Promise.all([
      getJson<Paged<UnitRateRow>>(firstUrl),
      getJson<Paged<UnitRateRow>>(`${base}/standing-charges/?page_size=10`).catch(() => null),
    ]);

    const rows: UnitRateRow[] = [...firstPage.results];
    let next = firstPage.next;
    let pages = 1;
    while (next && pages < MAX_PAGES) {
      const page = await getJson<Paged<UnitRateRow>>(next);
      rows.push(...page.results);
      next = page.next;
      pages += 1;
    }

    if (rows.length === 0) {
      const value: LiveResult<AgileTariff> = {
        ok: false,
        error: 'No Agile prices were published for this window.',
        source: SOURCE,
      };
      cache.set(key, { at: Date.now(), value });
      return value;
    }

    const rates = rows
      .map((row, i) => normaliseRate(row, rows[i + 1]?.valid_from ?? null))
      .filter((rate) => Number.isFinite(rate.unitRateP))
      .sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom));

    const standingRows = (standing?.results ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.valid_from) - Date.parse(a.valid_from));

    const value: LiveResult<AgileTariff> = {
      ok: true,
      data: {
        productCode: product,
        tariffCode,
        region,
        regionName: regionNameFor(region),
        standingChargeP: standingRows[0]?.value_inc_vat ?? 0,
        rates,
      },
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const value: LiveResult<AgileTariff> = {
      ok: false,
      error: `Live price feed unavailable (${message}).`,
      source: SOURCE,
    };
    cache.set(key, { at: Date.now() - env.live.cacheTtlMs + 60_000, value });
    return value;
  }
}

/** Exposed for the status endpoint / tests. */
export function clearOctopusCache(): void {
  cache.clear();
}
