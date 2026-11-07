import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from '../auth.js';
import { resolveSubscription, type SubscriptionView } from '../services/subscription.js';

/**
 * Central entitlement guard. Every protected route goes through this instead of
 * re-implementing "is this customer paid up?" in each handler.
 *
 * Order matters: authentication first (`requireUser`), then entitlement. The
 * response carries the normalised subscription so a client can route the user to
 * the right screen (plans, payment status, renewal) without guessing.
 */
export async function requireActiveSubscription(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.ownerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const subscription = await resolveSubscription(req.ownerId);
    if (!subscription.isActive) {
      res.status(402).json({
        error: 'An active subscription is required to use EnerOS.',
        code: 'subscription_required',
        subscription,
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Resolve the caller's subscription for handlers that need the detail. */
export async function subscriptionFor(ownerId: string): Promise<SubscriptionView> {
  return resolveSubscription(ownerId);
}
