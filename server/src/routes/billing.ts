import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { env, stripeEnabled } from '../env.js';
import { PLANS } from '../services/catalog.js';
import { getBilling, ownerForSubscription, setSubscription } from '../services/billing.js';
import { createCheckoutSession, verifyAndParseEvent } from '../lib/billing/stripe.js';

export const billingRouter = Router();

/** Current subscription summary. */
billingRouter.get('/status', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ billing: await getBilling(req.ownerId!) });
  } catch (error) {
    next(error);
  }
});

const checkoutSchema = z.object({ planId: z.enum(['starter', 'growth', 'autonomous']) });

/**
 * Start a subscription. With Stripe configured this returns a Checkout URL; with
 * no key it activates the plan in dev mode (labelled `mode: "dev"`) so the flow
 * is demoable without a real payment.
 */
billingRouter.post('/checkout', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a valid plan.' });
      return;
    }
    const plan = PLANS.find((p) => p.id === parsed.data.planId);
    if (!plan) {
      res.status(400).json({ error: 'Unknown plan.' });
      return;
    }

    const current = await getBilling(req.ownerId!);
    const sites = Math.max(1, current.sites);

    if (stripeEnabled) {
      try {
        const session = await createCheckoutSession({
          plan,
          sites,
          ownerId: req.ownerId!,
          email: req.userEmail,
        });
        res.json({ mode: 'stripe', url: session.url, planId: plan.id });
        return;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'not-configured') {
          res.status(502).json({ error: 'Could not start checkout. Please try again.' });
          return;
        }
        // fall through to dev mode
      }
    }

    // Dev mode: activate without payment so the product is demoable end to end.
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await setSubscription(req.ownerId!, {
      planId: plan.id,
      subscriptionStatus: 'active',
      currentPeriodEnd: periodEnd.toISOString(),
    });
    res.json({
      mode: 'dev',
      planId: plan.id,
      note: 'Stripe is not configured — the plan was activated without payment.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Stripe webhook. Registered in `app.ts` BEFORE `express.json` so the raw body is
 * available for signature verification. Always returns 200 once the event has
 * been authenticated, so Stripe does not retry indefinitely on our bugs.
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

    if (event.type === 'checkout.session.completed') {
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const ownerId = metadata.ownerId ?? (obj.client_reference_id as string | undefined);
      if (ownerId) {
        await setSubscription(ownerId, {
          planId: metadata.planId ?? 'starter',
          subscriptionStatus: 'active',
          stripeCustomerId: obj.customer as string | undefined,
          stripeSubscriptionId: obj.subscription as string | undefined,
        });
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
          await setSubscription(ownerId, {
            subscriptionStatus: obj.status ?? 'none',
            ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000).toISOString() } : {}),
          });
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[stripe] webhook handler failed', error);
    res.json({ received: true });
  }
}
