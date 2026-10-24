import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { analyseBill } from '../lib/analysis.js';
import { regionForPostcode, getCapPeriod } from '../lib/priceCap.js';
import type { Site } from '../types.js';
import { analyseDocument } from '../lib/intake.js';

export const publicRouter = Router();

/**
 * The free bill checker — the business plan's strongest acquisition tool: "a
 * free electricity bill check without requiring registration".
 *
 * It runs the SAME deterministic engine as the paid product (`analyseBill`), so
 * the result a visitor sees is real, not a teaser. Nothing is persisted, no auth
 * is required, and no LLM is called (fast, free, and it cannot hallucinate).
 */

// ── Lightweight in-memory rate limit (per IP) ─────────────────────────────────
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

const billSchema = z.object({
  supplier: z.string().max(120).optional(),
  postcode: z.string().max(12).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  consumptionKwh: z.number().nonnegative().max(100_000_000).optional(),
  unitRateP: z.number().nonnegative().max(1000).optional(),
  standingChargeP: z.number().nonnegative().max(1000).optional(),
  totalGbp: z.number().nonnegative().max(100_000_000).optional(),
  vatGbp: z.number().nonnegative().max(10_000_000).optional(),
  paymentMethod: z.enum(['direct-debit', 'standard-credit', 'prepayment']).optional(),
  businessContract: z.boolean().optional(),
});

/**
 * POST /api/public/bill-check
 *
 * Returns the same findings the product produces, plus the region it benchmarked
 * against, so the visitor can see the logic. The response is public-safe: no
 * internal ids, no persistence.
 */
publicRouter.post('/bill-check', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Too many checks from this connection. Please try again later.' });
    return;
  }

  const parsed = billSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the figures and try again.' });
    return;
  }

  const { postcode, ...input } = parsed.data;

  // Give the visitor *something* useful even if they only enter a total.
  const hasEnough =
    input.consumptionKwh !== undefined ||
    input.unitRateP !== undefined ||
    input.totalGbp !== undefined;
  if (!hasEnough) {
    res.status(400).json({
      error: 'Enter at least your total, your unit rate, or your consumption so we have something to check.',
    });
    return;
  }

  const region = postcode ? regionForPostcode(postcode) : undefined;
  const site = {
    id: 'public',
    name: 'Your site',
    city: '',
    region: region?.id ?? '',
    type: 'Restaurant',
    annualSpend: 0,
    monthActual: 0,
    monthExpected: 0,
    meterType: 'Smart',
    status: 'Optimal',
    postcode,
    loads: [],
    lastSynced: new Date().toISOString(),
  } as unknown as Site;

  const analysis = analyseBill(input, site);
  const capPeriod = getCapPeriod();

  res.json({
    score: analysis.score,
    recoverableGbp: analysis.recoverableGbp,
    findings: analysis.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail: f.detail,
      impactGbp: f.impactGbp,
      recommendation: f.recommendation,
    })),
    effectiveRateP: analysis.effectiveRateP,
    expectedTotalGbp: analysis.expectedTotalGbp,
    region: analysis.region,
    capPeriod: {
      label: capPeriod.label,
      averageUnitRateP: capPeriod.averageUnitRateP,
      averageStandingChargeP: capPeriod.averageStandingChargeP,
    },
    note:
      'This is a deterministic check against Ofgem reference rates and your own figures. It is not a final determination — a business contract may legitimately differ. Create an account to save it against a site.',
  });
});

/** Public metadata for the checker page (regions + cap period). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(application\/pdf|text\/plain|text\/csv|application\/csv|image\/(png|jpe?g|webp|heic|heif))$/.test(
      file.mimetype,
    );
    cb(null, ok);
  },
});

/**
 * Free bill check from a PDF/text upload. Runs the same intake pipeline as the
 * in-app flow: read → audit → advice. Public and rate-limited.
 */
publicRouter.post('/bill-check/file', upload.single('file'), async (req, res, next) => {
  try {
    const ip = req.ip ?? 'unknown';
    if (rateLimited(ip)) {
      res.status(429).json({ error: 'Too many checks from this connection. Please try again later.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Upload a PDF or text file (max 12 MB).' });
      return;
    }
    const result = await analyseDocument(req.file.buffer, undefined, req.file.mimetype);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/bill-check/meta', (_req, res) => {
  const period = getCapPeriod();
  res.json({
    capPeriod: {
      label: period.label,
      averageUnitRateP: period.averageUnitRateP,
      averageStandingChargeP: period.averageStandingChargeP,
      electricityVatPct: period.electricityVatPct,
    },
  });
});
