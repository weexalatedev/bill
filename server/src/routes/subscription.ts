import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { env, stripeEnabled } from '../env.js';
import { BILLING_PERIODS, isPlanId } from '../services/plans.js';
import {
  cancelPayment,
  cancelSubscription,
  confirmPayment,
  failPayment,
  paymentHistory,
  resolveSubscription,
  resumeSubscription,
  selectPlan,
  startCheckout,
} from '../services/subscription.js';

export const subscriptionRouter = Router();

const planSelection = z.object({
  planId: z.string().refine(isPlanId, 'Choose a valid plan.'),
  billingPeriod: z.enum(BILLING_PERIODS as unknown as [string, ...string[]]).default('monthly'),
});

/** The caller's current entitlement — the single status read used by the UI. */
subscriptionRouter.get('/status', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ subscription: await resolveSubscription(req.ownerId!) });
  } catch (error) {
    next(error);
  }
});

/**
 * Choose a plan. This creates a **pending** order only; it never activates
 * anything. Kept separate from checkout so the order summary can be shown first.
 */
subscriptionRouter.post('/select', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = planSelection.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Choose a valid plan.' });
      return;
    }
    const result = await selectPlan(
      req.ownerId!,
      parsed.data.planId,
      parsed.data.billingPeriod === 'annual' ? 'annual' : 'monthly',
    );
    res.json(result);
  } catch (error) {
    sendPlanError(error, res);
    if (!res.headersSent) next(error);
  }
});

/**
 * Create the payment attempt for the selected plan. Stripe → hosted checkout.
 * No Stripe key → a labelled test-mode payment that still has to be confirmed by
 * the server, so the "payment succeeded" path is never trusted from the client.
 */
subscriptionRouter.post('/checkout', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const body = req.body as { planId?: string; billingPeriod?: string };
    if (body.planId !== undefined && !isPlanId(body.planId)) {
      res.status(400).json({ error: 'Choose a valid plan.' });
      return;
    }
    const result = await startCheckout(req.ownerId!, {
      planId: body.planId,
      billingPeriod: body.billingPeriod === 'annual' ? 'annual' : 'monthly',
      email: req.userEmail,
      baseUrl: req.header('origin') || env.stripe.appBaseUrl,
    });
    res.json(result);
  } catch (error) {
    sendPlanError(error, res);
    if (!res.headersSent) next(error);
  }
});

/** Dev-mode settlement. With Stripe configured only the webhook may settle. */
subscriptionRouter.post(
  '/payments/:id/confirm',
  requireUser,
  async (req: AuthedRequest, res, next) => {
    try {
      if (stripeEnabled) {
        res.status(403).json({ error: 'Payments are settled by the payment provider.' });
        return;
      }
      const subscription = await confirmPayment(req.ownerId!, req.params.id);
      res.json({ subscription });
    } catch (error) {
      sendPlanError(error, res);
      if (!res.headersSent) next(error);
    }
  },
);

/** Dev-mode failure simulation — proves a failed payment cannot unlock access. */
subscriptionRouter.post('/payments/:id/fail', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    if (stripeEnabled) {
      res.status(403).json({ error: 'Payments are settled by the payment provider.' });
      return;
    }
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? String(req.body.reason).slice(0, 200)
        : 'Card declined (test mode).';
    res.json({ subscription: await failPayment(req.ownerId!, req.params.id, reason) });
  } catch (error) {
    sendPlanError(error, res);
    if (!res.headersSent) next(error);
  }
});

/** Dev-mode cancellation — proves an abandoned checkout grants nothing. */
subscriptionRouter.post(
  '/payments/:id/cancel',
  requireUser,
  async (req: AuthedRequest, res, next) => {
    try {
      if (stripeEnabled) {
        res.status(403).json({ error: 'Payments are settled by the payment provider.' });
        return;
      }
      res.json({ subscription: await cancelPayment(req.ownerId!, req.params.id) });
    } catch (error) {
      sendPlanError(error, res);
      if (!res.headersSent) next(error);
    }
  },
);

/** Payment history for the billing screen. */
subscriptionRouter.get('/payments', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ payments: await paymentHistory(req.ownerId!) });
  } catch (error) {
    next(error);
  }
});

/** Cancel at period end (access is kept until the paid period ends). */
subscriptionRouter.post('/cancel', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ subscription: await cancelSubscription(req.ownerId!) });
  } catch (error) {
    sendPlanError(error, res);
    if (!res.headersSent) next(error);
  }
});

/** Undo a scheduled cancellation. */
subscriptionRouter.post('/resume', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ subscription: await resumeSubscription(req.ownerId!) });
  } catch (error) {
    sendPlanError(error, res);
    if (!res.headersSent) next(error);
  }
});

/** Map domain errors to 400s with a stable code; rethrow everything else. */
function sendPlanError(error: unknown, res: import('express').Response): void {
  const code = (error as { code?: string }).code;
  if (code === 'plan' || code === 'payment') {
    res.status(400).json({ error: (error as Error).message, code });
  }
}
