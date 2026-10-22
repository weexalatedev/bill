import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { getConsumptionSeries, importConsumption } from '../services/consumption.js';
import { analyseConsumption } from '../lib/consumption/analyse.js';
import { getLiveTariffSnapshot } from '../lib/live/index.js';
import { SiteModel } from '../models/index.js';
import type { Site } from '../types.js';

export const consumptionRouter = Router();

const importSchema = z.object({
  siteId: z.string().min(1),
  csv: z.string().min(10).max(5_000_000),
});

/**
 * Import half-hourly consumption from a CSV. Idempotent: re-uploading the same
 * file updates rather than duplicates. Returns a quality report.
 */
consumptionRouter.post('/import', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a site and a CSV.' });
      return;
    }
    const result = await importConsumption(req.ownerId!, parsed.data.siteId, parsed.data.csv);
    if (!result) {
      res.status(404).json({ error: 'Site not found in this workspace.' });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Stored series + deterministic analysis, priced at the live mean unit rate for
 * the site's region (falling back to the Ofgem average if the feed is down).
 */
consumptionRouter.get('/:siteId', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const site = (await SiteModel.findOne({ ownerId: req.ownerId, id: req.params.siteId })
      .lean()
      .exec()) as Site | null;
    if (!site) {
      res.status(404).json({ error: 'Site not found in this workspace.' });
      return;
    }

    const series = await getConsumptionSeries(req.ownerId!, req.params.siteId);

    let meanP = 26.32;
    let priceSource = 'Ofgem cap average';
    try {
      const tariff = await getLiveTariffSnapshot({
        region: site.region,
        postcode: site.postcode,
        windowHours: 3,
      });
      if (tariff) {
        meanP = tariff.stats.meanUnitRateP;
        priceSource = `Live Agile mean (${tariff.regionName})`;
      }
    } catch {
      /* keep the fallback */
    }

    const analysis = analyseConsumption(series, { meanP });

    res.json({
      series,
      analysis,
      price: { meanP, source: priceSource },
      dataQuality: site.dataQuality ?? { consumption: 'none', coveragePct: 0 },
    });
  } catch (error) {
    next(error);
  }
});
