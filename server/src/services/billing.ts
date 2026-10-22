import { AccountModel } from '../models/index.js';
import { PLANS } from './catalog.js';
import { stripeEnabled } from '../env.js';

export interface BillingStatus {
  planId: string;
  planName: string;
  sites: number;
  pricePerSite: number;
  monthlyGbp: number;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  stripeEnabled: boolean;
  /** True when checkout would activate the plan without taking payment. */
  devMode: boolean;
}

interface AccountBillingRow {
  planId?: string;
  sites?: number;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
}

/** Current subscription summary for an owner. */
export async function getBilling(ownerId: string): Promise<BillingStatus> {
  const account = (await AccountModel.findOne({ ownerId }).lean().exec()) as
    | AccountBillingRow
    | null;
  const planId = account?.planId ?? 'starter';
  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0];
  const sites = account?.sites ?? 0;
  return {
    planId,
    planName: plan.name,
    sites,
    pricePerSite: plan.pricePerSite,
    monthlyGbp: sites * plan.pricePerSite,
    subscriptionStatus: account?.subscriptionStatus ?? 'none',
    currentPeriodEnd: account?.currentPeriodEnd ?? null,
    stripeEnabled,
    devMode: !stripeEnabled,
  };
}

/** Apply a billing patch (plan change, status, Stripe ids). */
export async function setSubscription(
  ownerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await AccountModel.updateOne({ ownerId }, { $set: patch }, { upsert: true }).exec();
}

/** Look up an owner by their Stripe subscription id (webhook → account). */
export async function ownerForSubscription(subscriptionId: string): Promise<string | null> {
  const doc = (await AccountModel.findOne({ stripeSubscriptionId: subscriptionId })
    .lean()
    .exec()) as { ownerId?: string } | null;
  return doc?.ownerId ?? null;
}
