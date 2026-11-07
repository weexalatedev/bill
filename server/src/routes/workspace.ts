import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { env } from '../env.js';
import { releaseSiteSlot, reserveSiteSlot } from '../services/subscription.js';
import { subscriptionFor } from '../middleware/subscription.js';
import type { MeterType, Site, SiteStatus, SiteType } from '../types.js';
import {
  addSite,
  getWorkspace,
  removeSite,
  setControlMode,
  updateSite,
} from '../services/workspace.js';

export const workspaceRouter = Router();

/** Everything the clients need to hydrate their store, scoped to the caller. */
workspaceRouter.get('/', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const workspace = await getWorkspace(req.ownerId!, env.autoProvision);
    res.json({ workspace, user: { email: req.userEmail, name: req.userName } });
  } catch (error) {
    next(error);
  }
});

const modeSchema = z.object({ mode: z.enum(['Recommend', 'Approve', 'Automate']) });

workspaceRouter.put('/control-mode', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid control mode.' });
      return;
    }
    await setControlMode(req.ownerId!, parsed.data.mode);
    res.json({ controlMode: parsed.data.mode });
  } catch (error) {
    next(error);
  }
});

// ── Sites ──────────────────────────────────────────────────────────────────────

const SITE_TYPES = [
  'Restaurant',
  'Café',
  'Bakery',
  'Pub',
  'Hotel',
  'Food Production',
  'Retail',
] as const satisfies readonly SiteType[];

const METER_TYPES = ['Smart', 'Advanced', 'AMR', 'Half-hourly'] as const satisfies readonly MeterType[];

const SITE_STATUSES = ['Optimal', 'Watch', 'Anomaly'] as const satisfies readonly SiteStatus[];

/**
 * A new site's spend fields default to zero rather than being required: on the
 * Add-site form these are unknown until bills are audited, and `monthExpected`
 * falls back to `monthActual` so a fresh site does not render as a saving.
 */
const siteSchema = z.object({
  name: z.string().trim().min(1, 'Site name is required.').max(120),
  city: z.string().trim().max(80).default(''),
  region: z.string().trim().max(80).default(''),
  type: z.enum(SITE_TYPES),
  annualSpend: z.number().min(0).max(1e9).default(0),
  monthActual: z.number().min(0).max(1e7).default(0),
  monthExpected: z.number().min(0).max(1e7).optional(),
  meterType: z.enum(METER_TYPES),
  status: z.enum(SITE_STATUSES).default('Optimal'),
  postcode: z.string().trim().max(12).optional(),
  loads: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  lastSynced: z.string().trim().max(40).default('Never'),
});

/** Only a subset of fields is editable after creation; `id` is server-minted. */
const sitePatchSchema = siteSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'No fields to update.',
);

/** Add a site to the caller's workspace, within their plan's capacity. */
workspaceRouter.post('/sites', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = siteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid site payload.' });
      return;
    }

    // Capacity is enforced here, on the server, before any document is written.
    // `reserveSiteSlot` compares and increments atomically, so parallel requests
    // cannot both take the last slot.
    const reservation = await reserveSiteSlot(req.ownerId!);
    if (!reservation.ok) {
      const capacity = reservation.reason === 'capacity';
      res.status(capacity ? 403 : 402).json({
        error: capacity
          ? `You have reached the maximum number of sites allowed in your current subscription. Upgrade your plan to add more sites.`
          : 'An active subscription is required to add sites.',
        code: capacity ? 'site_limit_reached' : 'subscription_required',
        subscription: reservation.subscription,
      });
      return;
    }

    const { monthExpected, ...rest } = parsed.data;
    try {
      const site = await addSite(req.ownerId!, {
        ...rest,
        monthExpected: monthExpected ?? rest.monthActual,
      } as Parameters<typeof addSite>[1]);
      res.status(201).json({
        site,
        subscription: await subscriptionFor(req.ownerId!),
      });
    } catch (error) {
      // Give the reserved slot back: a failed write must not consume capacity.
      await releaseSiteSlot(req.ownerId!);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/** Edit an existing site. */
workspaceRouter.patch('/sites/:id', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = sitePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid site payload.' });
      return;
    }
    const site = await updateSite(req.ownerId!, req.params.id, parsed.data);
    if (!site) {
      res.status(404).json({ error: 'Site not found.' });
      return;
    }
    res.json({ site });
  } catch (error) {
    next(error);
  }
});

/** Remove a site and its invoices and actions. */
workspaceRouter.delete('/sites/:id', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const removed = await removeSite(req.ownerId!, req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Site not found.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});