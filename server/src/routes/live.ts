import { Router } from 'express';
import { z } from 'zod';
import { fetchCarbonForecast } from '../lib/live/carbon.js';
import { planShift } from '../lib/live/derive.js';
import {
  getLiveSiteFlow,
  getLiveSnapshot,
  getLiveTariffSnapshot,
  resolveLiveRegion,
} from '../lib/live/index.js';
import { OCTOPUS_REGION_LETTERS } from '../lib/live/regions.js';
import { requireUser, type AuthedRequest } from '../auth.js';
import { SiteModel } from '../models/index.js';
import type { Site } from '../types.js';

export const liveRouter = Router();

const querySchema = z.object({
  region: z.string().optional(),
  postcode: z.string().optional(),
  hours: z.coerce.number().min(0.5).max(12).optional(),
  kwh: z.coerce.number().min(1).max(100_000).optional(),
});

/**
 * Health of the live layer. Public — the marketing/sales funnel reads it before
 * sign-in to show whether real prices are flowing.
 */
liveRouter.get('/status', async (_req, res, next) => {
  try {
    const [tariff, carbon] = await Promise.all([
      getLiveTariffSnapshot({ windowHours: 3 }),
      fetchCarbonForecast(),
    ]);
    res.json({
      ok: Boolean(tariff),
      feeds: {
        octopus: { ok: Boolean(tariff), region: tariff?.region ?? null, source: 'Octopus Energy' },
        carbon: { ok: carbon.ok, source: 'NESO Carbon Intensity' },
      },
      regions: OCTOPUS_REGION_LETTERS,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * The live half-hourly price curve for a site, plus a shift plan. Public: this
 * is published market data and powers the frictionless "free energy health
 * check" the plan describes.
 */
liveRouter.get('/tariff', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters.' });
      return;
    }
    const { region, postcode, hours = 3, kwh = 100 } = parsed.data;
    const resolved = resolveLiveRegion({ region, postcode });
    const tariff = await getLiveTariffSnapshot({
      region: resolved.region,
      postcode,
      windowHours: hours,
    });

    if (!tariff) {
      res.status(503).json({
        error: 'The live UK price feed is unavailable right now. Please try again shortly.',
      });
      return;
    }

    res.json({
      tariff,
      shift: planShift(tariff.rates, kwh, hours),
      regionVia: resolved.via,
    });
  } catch (error) {
    next(error);
  }
});

/** Current + next-24h GB carbon intensity. Public. */
liveRouter.get('/carbon', async (_req, res, next) => {
  try {
    const result = await fetchCarbonForecast();
    if (!result.ok) {
      res.status(503).json({ error: result.error });
      return;
    }
    res.json({
      current: result.data.current,
      forecast: result.data.forecast,
      source: result.source,
      fetchedAt: result.fetchedAt,
    });
  } catch (error) {
    next(error);
  }
});

/** Everything the Live page needs in one call. Public. */
liveRouter.get('/snapshot', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters.' });
      return;
    }
    const { region, postcode, hours = 3, kwh = 100 } = parsed.data;
    const resolved = resolveLiveRegion({ region, postcode });
    const snapshot = await getLiveSnapshot({
      region: resolved.region,
      postcode,
      windowHours: hours,
    });
    res.json({
      ...snapshot,
      shift: snapshot.tariff ? planShift(snapshot.tariff.rates, kwh, hours) : null,
      regionVia: resolved.via,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Whole-site live energy flow — the data behind the Energy Flow Diagram.
 *
 * Authenticated: it reads one of the caller's own sites. The prices are live and
 * public, the site's scale comes from its own workspace data.
 */
liveRouter.get('/site-flow', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = z
      .object({ siteId: z.string().min(1), region: z.string().optional() })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'siteId is required.' });
      return;
    }

    const site = (await SiteModel.findOne({ ownerId: req.ownerId, id: parsed.data.siteId })
      .lean()
      .exec()) as Site | null;
    if (!site) {
      res.status(404).json({ error: 'Site not found in this workspace.' });
      return;
    }

    const result = await getLiveSiteFlow({
      site: {
        id: site.id,
        name: site.name,
        type: site.type,
        loads: site.loads ?? [],
        monthActual: site.monthActual,
      },
      region: parsed.data.region ?? site.region,
      postcode: site.postcode,
    });

    if (!result) {
      res.status(503).json({
        error: 'The live UK price feed is unavailable right now. Please try again shortly.',
      });
      return;
    }

    const carbon = await fetchCarbonForecast().catch(() => null);
    res.json({
      flow: result.flow,
      tariff: result.tariff,
      carbon: carbon && carbon.ok ? { current: carbon.data.current, source: carbon.source } : null,
    });
  } catch (error) {
    next(error);
  }
});
