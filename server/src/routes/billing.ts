import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { env } from '../env.js';
import { AccountModel, PaymentModel } from '../models/index.js';
import { isPlanId } from '../services/plans.js';
import {
  cancelPayment,
  confirmPayment,
  failPayment,
  ownerForSubscription,
  recordWebhookEvent,
  resolveSubscription,
  startCheckout,
} from '../services/subscription.js';
import { verifyAndParseEvent } from '../lib/billing/stripe.js';

export const billingRouter = Router();

/**
 * Legacy billing surface, kept so the existing console and the mobile app keep
 * working. It is a thin projection of the subscription service: one source of
 * truth, two shapes.
 */
billingRouter.get('/status', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const subscription = await resolveSubscription(req.ownerId!);
    res.json({
      billing: {
        planId: subscription.planId,
        planName: subscription.planName,
        sites: subscription.sitesUsed,
        pricePerSite: subscription.pricePerSite,
        monthlyGbp: subscription.monthlyGbp,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        stripeEnabled: subscription.stripeEnabled,
        devMode: subscription.devMode,
      },
      subscription,
    });
  } catch (error) {
    next(error);
  }
});

const checkoutSchema = z.object({
  planId: z.string().refine(isPlanId, 'Choose a valid plan.').optional(),
  billingPeriod: z.enum(['monthly', 'annual']).optional(),
});

/** Start checkout for the selected (or given) plan. Never activates anything. */
billingRouter.post('/checkout', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a valid plan.' });
      return;
    }
    const result = await startCheckout(req.ownerId!, {
      planId: parsed.data.planId,
      billingPeriod: parsed.data.billingPeriod,
      email: req.userEmail,
      baseUrl: req.header('origin') || env.stripe.appBaseUrl,
    });
    res.json({ ...result, planId: result.order.planId });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'plan' || code === 'payment') {
      res.status(400).json({ error: (error as Error).message, code });
      return;
    }
    next(error);
  }
});

/**
 * Stripe webhook. Registered in `app.ts` BEFORE `express.json` so the raw body is
 * available for signature verification. Every event id is recorded once, so a
 * replay can never activate or extend a subscription twice.
 */
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const raw = req.body as Buffer | undefined;
  if (!raw || !Buffer.isBuffer(raw)) {
    res.status(400).json({ error: 'Expected a raw webhook body.' });
    return;
  }

  const event = verifyAndParseEvent(
    raw,
    req.header('stripe-signature') ?? undefined,
    env.stripe.webhookSecret,
  );
  if (!event) {
    res.status(400).json({ error: 'Invalid webhook signature.' });
    return;
  }

  try {
    const obj = (event.data?.object ?? {}) as Record<string, unknown>;
    const eventId = event.id ?? `${event.type ?? 'event'}:${String(obj.id ?? Date.now())}`;
    const fresh = await recordWebhookEvent(eventId, event.type);
    if (!fresh) {
      res.json({ received: true, duplicate: true });
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const ownerId = metadata.ownerId ?? (obj.client_reference_id as string | undefined);
      const paymentId = metadata.paymentId;
      if (ownerId && paymentId) {
        const payment = (await PaymentModel.findOne({ ownerId, id: paymentId }).lean().exec()) as
          | { amountPence?: number }
          | null;
        const paid = typeof obj.amount_total === 'number' ? obj.amount_total : null;
        if (!payment) {
          console.warn('[stripe] webhook for unknown payment', paymentId);
        } else if (paid !== null && payment.amountPence !== paid) {
          // Amount tampering / wrong session: never activate.
          await failPayment(ownerId, paymentId, 'Paid amount did not match the order.');
        } else if (obj.payment_status && obj.payment_status !== 'paid') {
          console.warn('[stripe] checkout not paid yet', paymentId, obj.payment_status);
        } else {
          await confirmPayment(ownerId, paymentId, { providerEventId: eventId });
        }
      }
    } else if (event.type === 'checkout.session.expired') {
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const ownerId = metadata.ownerId ?? (obj.client_reference_id as string | undefined);
      if (ownerId && metadata.paymentId) {
        await cancelPayment(ownerId, metadata.paymentId);
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      if (metadata.ownerId && metadata.paymentId) {
        await failPayment(metadata.ownerId, metadata.paymentId, 'The payment failed.');
      }
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscriptionId = obj.id as string | undefined;
      if (subscriptionId) {
        const ownerId = await ownerForSubscription(subscriptionId);
        if (ownerId) {
          const periodEnd = obj.current_period_end as number | undefined;
          const status = event.type === 'customer.subscription.deleted' ? 'expired' : obj.status;
          await AccountModel.updateOne(
            { ownerId },
            {
              $set: {
                subscriptionStatus: typeof status === 'string' ? status : 'active',
                ...(periodEnd
                  ? { currentPeriodEnd: new Date(periodEnd * 1000).toISOString() }
                  : {}),
              },
            },
          ).exec();
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[stripe] webhook handler failed', error);
    res.json({ received: true });
  }
}
