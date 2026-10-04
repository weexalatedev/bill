import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { InvoiceModel, SiteModel } from '../models/index.js';
import { auditInvoice, invoiceTotal, type UploadPayload } from '../lib/audit.js';
import { recoverInvoice } from '../services/workspace.js';
import type { Site } from '../types.js';

export const invoicesRouter = Router();

const uploadSchema = z.object({
  siteId: z.string().min(1),
  supplier: z.string().min(1),
  period: z.string().min(1),
  consumptionKwh: z.number().positive(),
  unitRateP: z.number().positive(),
  standingChargeP: z.number().min(0),
  documentId: z.string().optional(),
});

/** Run the audit heuristic on a submitted invoice and persist the result. */
invoicesRouter.post('/', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid invoice payload.' });
      return;
    }
    const payload = parsed.data as UploadPayload;
    const site = await SiteModel.findOne({ ownerId: req.ownerId, id: payload.siteId })
      .lean()
      .exec();
    const issues = auditInvoice(payload, (site as Site | null) ?? undefined);
    const invoice = await InvoiceModel.create({
      ownerId: req.ownerId,
      id: `INV-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      siteId: payload.siteId,
      supplier: payload.supplier,
      period: payload.period,
      consumptionKwh: payload.consumptionKwh,
      unitRateP: payload.unitRateP,
      standingChargeP: payload.standingChargeP,
      total: invoiceTotal(payload),
      status: issues.length > 0 ? 'Flagged' : 'Clean',
      issues,
    });
    res.status(201).json({ invoice: invoice.toJSON() });
  } catch (error) {
    next(error);
  }
});

/** Challenge a flagged invoice and request recovery. */
invoicesRouter.post('/:id/recover', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const invoice = await recoverInvoice(req.ownerId!, req.params.id);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});
