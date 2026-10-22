import { ConsumptionModel, SiteModel } from '../models/index.js';
import { parseConsumptionCsv, type ConsumptionPoint, type CsvQuality } from '../lib/consumption/csv.js';

const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ImportResult {
  imported: number;
  stored: number;
  quality: CsvQuality;
  dataQuality: { consumption: 'hh'; coveragePct: number; lastReadingAt: string };
}

/** Import a CSV for one of the owner's sites. Returns null if the site is unknown. */
export async function importConsumption(
  ownerId: string,
  siteId: string,
  csv: string,
): Promise<ImportResult | null> {
  const site = await SiteModel.findOne({ ownerId, id: siteId }).lean().exec();
  if (!site) return null;

  const { points, quality } = parseConsumptionCsv(csv);
  if (points.length === 0) {
    return {
      imported: 0,
      stored: 0,
      quality,
      dataQuality: { consumption: 'hh', coveragePct: 0, lastReadingAt: '' },
    };
  }

  // Idempotent upsert on (owner, site, from) so re-uploads do not duplicate.
  const ops = points.map((p) => ({
    updateOne: {
      filter: { ownerId, siteId, from: new Date(p.from) },
      update: { $set: { kwh: p.kwh } },
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += 1000) {
    await ConsumptionModel.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }

  const stored = await ConsumptionModel.countDocuments({ ownerId, siteId }).exec();
  const firstDoc = (await ConsumptionModel.findOne({ ownerId, siteId }).sort({ from: 1 }).lean().exec()) as
    | { from: Date }
    | null;
  const lastDoc = (await ConsumptionModel.findOne({ ownerId, siteId }).sort({ from: -1 }).lean().exec()) as
    | { from: Date }
    | null;

  const first = firstDoc ? new Date(firstDoc.from).getTime() : 0;
  const last = lastDoc ? new Date(lastDoc.from).getTime() : 0;
  const days = first && last ? Math.max(1, Math.floor((last - first) / DAY_MS) + 1) : 1;
  const coveragePct = Math.min(100, Math.round((stored / (days * 48)) * 100));
  const lastReadingAt = last ? new Date(last).toISOString() : '';

  await SiteModel.updateOne(
    { ownerId, id: siteId },
    { $set: { dataQuality: { consumption: 'hh', coveragePct, lastReadingAt } } },
  ).exec();

  return {
    imported: points.length,
    stored,
    quality: { ...quality, coveragePct },
    dataQuality: { consumption: 'hh', coveragePct, lastReadingAt },
  };
}

/** Full stored half-hourly series for a site, ascending. */
export async function getConsumptionSeries(
  ownerId: string,
  siteId: string,
): Promise<ConsumptionPoint[]> {
  const docs = (await ConsumptionModel.find({ ownerId, siteId }).sort({ from: 1 }).lean().exec()) as {
    from: Date | string;
    kwh: number;
  }[];
  return docs.map((d) => ({ from: new Date(d.from).toISOString(), kwh: d.kwh }));
}

export { HALF_HOUR_MS };
