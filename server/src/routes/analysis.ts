import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { analyseBill, assessPortfolio } from '../lib/analysis.js';
import { getCapPeriod, regionForPostcode } from '../lib/priceCap.js';
import { extractBill, extractionAvailable } from '../lib/llm.js';
import { narrateAudit } from '../lib/auditor.js';
import { fetchWeatherSummary } from '../lib/weather.js';
import { InvoiceModel, SiteModel } from '../models/index.js';
import type { Invoice, Site } from '../types.js';

export const analysisRouter = Router();

/**
 * The Ofgem cap table. Public and cached for an hour: it is published data, it
 * only changes at the quarterly release, and the marketing pages need it before
 * sign-in.
 */
let capCache: { at: number; body: unknown } | null = null;
const CAP_CACHE_MS = 60 * 60 * 1000;

analysisRouter.get('/price-cap', (_req, res) => {
  if (capCache && Date.now() - capCache.at < CAP_CACHE_MS) {
    res.json(capCache.body);
    return;
  }
  const period = getCapPeriod();
  const body = {
    period: {
      id: period.id,
      label: period.label,
      start: period.start,
      end: period.end,
      averageUnitRateP: period.averageUnitRateP,
      averageStandingChargeP: period.averageStandingChargeP,
      changePct: period.changePct,
      electricityVatPct: period.electricityVatPct,
      source:
        'Ofgem — Energy price cap unit rates and standing charges (https://www.ofgem.gov.uk)',
    },
    regions: period.regions,
    extractionAvailable,
  };
  capCache = { at: Date.now(), body };
  res.json(body);
});

/** Resolve a postcode to a cap region so signup can pre-fill the benchmark. */
analysisRouter.get('/region', (req, res) => {
  const postcode = String(req.query.postcode ?? '').trim();
  if (!postcode) {
    res.status(400).json({ error: 'postcode is required.' });
    return;
  }
  const region = regionForPostcode(postcode);
  if (!region) {
    res.json({ region: null, note: 'Postcode not recognised — the region can be set manually.' });
    return;
  }
  res.json({
    region: {
      id: region.id,
      name: region.name,
      unitRateP: region.unitRateP,
      standingChargeP: region.standingChargeP,
    },
    estimated: true,
  });
});

const billSchema = z.object({
  siteId: z.string().optional(),
  supplier: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  consumptionKwh: z.number().nonnegative().optional(),
  unitRateP: z.number().nonnegative().optional(),
  standingChargeP: z.number().nonnegative().optional(),
  totalGbp: z.number().nonnegative().optional(),
  vatGbp: z.number().nonnegative().optional(),
  paymentMethod: z.enum(['direct-debit', 'standard-credit', 'prepayment']).optional(),
  nightShare: z.number().min(0).max(1).optional(),
  tariffName: z.string().optional(),
  businessContract: z.boolean().optional(),
  /** When true, also return degree-day normalisation for the window. */
  includeWeather: z.boolean().optional(),

});

/**
 * Analyse a bill on its own terms — nothing is persisted. This is the
 * "check before you commit" endpoint behind the Smart Analysis page.
 */
analysisRouter.post('/bill', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = billSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid bill payload.' });
      return;
    }
    const { includeWeather, siteId, ...input } = parsed.data;

    const site = siteId
      ? ((await SiteModel.findOne({ ownerId: req.ownerId, id: siteId }).lean().exec()) as
          | Site
          | null)
      : null;

    const weather =
      includeWeather && input.periodStart && input.periodEnd
        ? await fetchWeatherSummary(input.periodStart, input.periodEnd)
        : undefined;

    res.json({ analysis: analyseBill(input, site ?? undefined), weather: weather ?? null });
  } catch (error) {
    next(error);
  }
});

/**
 * Paste-a-bill: run the text through the extraction LLM, then analyse the result.
 * Degrades to a clear 503 when no key is configured, so the UI can explain
 * itself rather than showing a generic failure.
 */
analysisRouter.post('/extract', requireUser, async (req: AuthedRequest, res) => {
  const body = z.object({ text: z.string().min(20) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Paste at least a few lines of the bill.' });
    return;
  }
  if (!extractionAvailable) {
    res.status(503).json({
      error:
        'LLM extraction is not configured. Set GEMINI_API_KEY on the API, or use the manual bill form.',
    });
    return;
  }
  const extracted = await extractBill(body.data.text);
  if (!extracted) {
    res.status(502).json({
      error: 'The extractor could not read this bill — try the manual form.',
    });
    return;
  }
  res.json({ extracted, analysis: analyseBill(extracted) });
});

/** Re-run the engine across every stored invoice and return the portfolio view. */
analysisRouter.get('/portfolio', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const [sites, invoices] = await Promise.all([
      SiteModel.find({ ownerId: req.ownerId }).lean().exec(),
      InvoiceModel.find({ ownerId: req.ownerId }).lean().exec(),
    ]);
    const typedSites = sites as unknown as Site[];
    const typedInvoices = invoices as unknown as Invoice[];

    const entries = typedInvoices.map((invoice) => ({
      siteId: invoice.siteId,
      analysis: analyseBill(
        {
          supplier: invoice.supplier,
          consumptionKwh: invoice.consumptionKwh,
          unitRateP: invoice.unitRateP,
          standingChargeP: invoice.standingChargeP,
          totalGbp: invoice.total,
        },
        typedSites.find((s) => s.id === invoice.siteId),
      ),
    }));

    res.json({
      risks: assessPortfolio(typedSites, entries),
      totals: {
        analysed: typedInvoices.length,
        withFindings: entries.filter((e) => e.analysis.findings.length > 0).length,
        recoverableGbp:
          Math.round(entries.reduce((sum, e) => sum + e.analysis.recoverableGbp, 0) * 100) / 100,
      },
      capPeriod: getCapPeriod().label,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Narrate an audit: run the deterministic engine, then ask Gemini to explain
 * the findings in plain English. The engine still decides — this only explains.
 */
analysisRouter.post('/narrate', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = billSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid bill payload.' });
      return;
    }
    const { includeWeather, siteId, ...input } = parsed.data;
    const site = siteId
      ? ((await SiteModel.findOne({ ownerId: req.ownerId, id: siteId }).lean().exec()) as Site | null)
      : null;

    const analysis = analyseBill(input, site ?? undefined);
    const narration = await narrateAudit(analysis, input);
    res.json({ analysis, narration });
  } catch (error) {
    next(error);
  }
});
