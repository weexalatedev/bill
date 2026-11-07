/**
 * Subscription lifecycle — the only place that decides whether an owner may use
 * the product, what they are paying, and how much capacity they have.
 *
 * State machine (persisted on the account document):
 *
 *   none ──select plan──▶ pending ──checkout──▶ payment_pending
 *     ▲                                            │
 *     │                            verified webhook / dev confirmation
 *     │                                            ▼
 *     └──────────── expired ◀── lapse ◀────── active ──cancel──▶ cancelled
 *                                                  │                 │
 *                                             failed ◀── failed payment
 *
 * A subscription is only `active` after the payment provider confirmed it —
 * never because a client said so. Capacity, renewal dates and the site limit are
 * copied from the catalogue at activation so later catalogue edits never
 * silently change a live customer's contract.
 */
import { AccountModel, PaymentModel, SiteModel, WebhookEventModel } from '../models/index.js';
import { ownerIdFromEmail } from '../auth.js';
import { env } from '../env.js';
import { stripeEnabled } from '../env.js';
import {
  SITE_LIMIT_PROVENANCE,
  monthlyRunRate,
  planById,
  priceOrder,
  planError,
  type BillingPeriod,
  type OrderSummary,
  type PlanId,
} from './plans.js';

export type SubscriptionStatus =
  | 'none'
  | 'pending'
  | 'payment_pending'
  | 'active'
  | 'failed'
  | 'cancelled'
  | 'expired';

const STATUSES: readonly SubscriptionStatus[] = [
  'none',
  'pending',
  'payment_pending',
  'active',
  'failed',
  'cancelled',
  'expired',
];

export interface PaymentView {
  id: string;
  planId: string;
  planName: string;
  billingPeriod: BillingPeriod;
  provider: 'stripe' | 'dev';
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amountPence: number;
  amountGbp: number;
  currency: string;
  description: string;
  createdAt: string;
  paidAt: string | null;
  failureReason: string | null;
}

export interface SubscriptionView {
  status: SubscriptionStatus;
  isActive: boolean;
  planId: PlanId;
  planName: string;
  planTagline: string;
  pricePerSite: number;
  billingPeriod: BillingPeriod;
  siteLimit: number;
  siteLimitSource: string;
  sitesUsed: number;
  remainingSites: number;
  canAddSite: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  monthlyGbp: number;
  pendingChange: { planId: PlanId; planName: string; billingPeriod: BillingPeriod } | null;
  pendingPaymentId: string | null;
  latestPayment: PaymentView | null;
  stripeEnabled: boolean;
  devMode: boolean;
}

interface AccountRow {
  planId?: string;
  sites?: number;
  siteLimit?: number;
  siteLimitSource?: string;
  subscriptionStatus?: string;
  billingPeriod?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  pendingPlanId?: string;
  pendingBillingPeriod?: string;
  lastPaymentId?: string;
}

const nowIso = (): string => new Date().toISOString();

/** Add calendar months to a date, matching how the plan is billed. */
export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

function asPeriod(value: string | undefined): BillingPeriod {
  return value === 'annual' ? 'annual' : 'monthly';
}

function asStatus(value: string | undefined): SubscriptionStatus {
  return (STATUSES as readonly string[]).includes(value ?? '')
    ? (value as SubscriptionStatus)
    : 'none';
}

/** True for the configured demo identity — the only pre-paid workspace. */
export function isDemoOwner(ownerId: string): boolean {
  return ownerId === ownerIdFromEmail(env.demo.email);
}

/**
 * The demo workspace is a live, paid subscription so the product is explorable
 * without a payment step. It is keyed to the demo identity only.
 */
async function applyDemoEntitlement(ownerId: string): Promise<void> {
  if (!isDemoOwner(ownerId)) return;
  const start = new Date();
  await AccountModel.updateOne(
    { ownerId },
    {
      $set: {
        planId: 'autonomous',
        subscriptionStatus: 'active',
        billingPeriod: 'monthly',
        siteLimit: planById('autonomous').siteLimit,
        siteLimitSource: SITE_LIMIT_PROVENANCE,
        currentPeriodStart: start.toISOString(),
        currentPeriodEnd: addMonths(start, 12).toISOString(),
        cancelAtPeriodEnd: false,
      },
    },
    { upsert: true },
  ).exec();
}

/**
 * Load (or lazily create) the account document for an owner. New accounts start
 * at `none`: registered, but with no entitlement until a plan is paid for.
 */
export async function ensureAccount(ownerId: string): Promise<AccountRow> {
  const existing = (await AccountModel.findOne({ ownerId }).lean().exec()) as AccountRow | null;
  if (existing) {
    // Self-heal the demo identity only: it must never require a card, and a
    // previous run may have created the account before the demo entitlement
    // existed. Real customers are never granted anything here.
    if (isDemoOwner(ownerId) && (!existing.subscriptionStatus || existing.subscriptionStatus === 'none')) {
      await applyDemoEntitlement(ownerId);
      return ((await AccountModel.findOne({ ownerId }).lean().exec()) ?? existing) as AccountRow;
    }
    return existing;
  }
  await AccountModel.updateOne(
    { ownerId },
    { $setOnInsert: { ownerId, sites: 0, controlMode: 'Approve', subscriptionStatus: 'none' } },
    { upsert: true },
  ).exec();
  await applyDemoEntitlement(ownerId);
  return ((await AccountModel.findOne({ ownerId }).lean().exec()) ?? {}) as AccountRow;
}

/** Live count of the owner's sites — the source of truth for capacity. */
export async function countSites(ownerId: string): Promise<number> {
  return SiteModel.countDocuments({ ownerId }).exec();
}

/** Write the denormalised site count back so it can never drift for long. */
export async function syncSiteCount(ownerId: string): Promise<number> {
  const total = await countSites(ownerId);
  await AccountModel.updateOne({ ownerId }, { $set: { sites: total } }, { upsert: true }).exec();
  return total;
}

/** Normalise one payment document for the API. */
function paymentView(doc: Record<string, unknown>): PaymentView {
  const plan = planById(typeof doc.planId === 'string' ? doc.planId : null);
  const amountPence = typeof doc.amountPence === 'number' ? doc.amountPence : 0;
  return {
    id: String(doc.id ?? ''),
    planId: plan.id,
    planName: plan.name,
    billingPeriod: asPeriod(doc.billingPeriod as string | undefined),
    provider: doc.provider === 'stripe' ? 'stripe' : 'dev',
    status: (doc.status as PaymentView['status']) ?? 'pending',
    amountPence,
    amountGbp: Math.round(amountPence) / 100,
    currency: typeof doc.currency === 'string' ? doc.currency : 'GBP',
    description:
      typeof doc.description === 'string' ? doc.description : `${plan.name} subscription`,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : nowIso(),
    paidAt: typeof doc.paidAt === 'string' ? doc.paidAt : null,
    failureReason: typeof doc.failureReason === 'string' ? doc.failureReason : null,
  };
}

/**
 * The single read model every guard, page and endpoint uses. It also lapses a
 * subscription whose paid period has run out, so access rules never depend on a
 * background job having run.
 */
export async function resolveSubscription(ownerId: string): Promise<SubscriptionView> {
  const account = await ensureAccount(ownerId);
  const sitesUsed = await countSites(ownerId);
  // Capacity is governed by the reserved-slot counter (`sites`), which only
  // `reserveSiteSlot`/`releaseSiteSlot`/`syncSiteCount` may write. This read
  // model must never write it: an in-flight reservation would be clobbered and
  // two concurrent adds could squeeze past the cap.
  const usedSlots = Math.max(typeof account.sites === 'number' ? account.sites : 0, sitesUsed);

  let status = asStatus(account.subscriptionStatus);
  const periodEnd = account.currentPeriodEnd ?? null;
  const ended = periodEnd ? new Date(periodEnd).getTime() <= Date.now() : false;

  // An active (or cancelled-but-still-paid) period that has run out is expired.
  if ((status === 'active' || status === 'cancelled') && ended) {
    status = 'expired';
    await AccountModel.updateOne({ ownerId }, { $set: { subscriptionStatus: 'expired' } }).exec();
  }

  const isActive =
    (status === 'active' || status === 'cancelled') && Boolean(periodEnd) && !ended;

  const plan = planById(account.planId);
  const siteLimit = typeof account.siteLimit === 'number' ? account.siteLimit : plan.siteLimit;
  const billingPeriod = asPeriod(account.billingPeriod);

  const latest = (await PaymentModel.findOne({ ownerId })
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as Record<string, unknown> | null;
  const latestPayment = latest ? paymentView(latest) : null;

  const pendingPlan = account.pendingPlanId ? planById(account.pendingPlanId) : null;

  return {
    status,
    isActive,
    planId: plan.id,
    planName: plan.name,
    planTagline: plan.tagline,
    pricePerSite: plan.pricePerSite,
    billingPeriod,
    siteLimit,
    siteLimitSource: account.siteLimitSource ?? SITE_LIMIT_PROVENANCE,
    sitesUsed,
    remainingSites: Math.max(0, siteLimit - usedSlots),
    canAddSite: isActive && usedSlots < siteLimit,
    currentPeriodStart: account.currentPeriodStart ?? null,
    currentPeriodEnd: periodEnd,
    renewalDate: periodEnd,
    cancelAtPeriodEnd: Boolean(account.cancelAtPeriodEnd),
    monthlyGbp: monthlyRunRate(plan.id, sitesUsed),
    pendingChange:
      pendingPlan && pendingPlan.id !== plan.id
        ? {
            planId: pendingPlan.id,
            planName: pendingPlan.name,
            billingPeriod: asPeriod(account.pendingBillingPeriod),
          }
        : null,
    pendingPaymentId:
      latestPayment && latestPayment.status === 'pending' ? latestPayment.id : null,
    latestPayment,
    stripeEnabled,
    devMode: !stripeEnabled,
  };
}

// ── Plan selection ────────────────────────────────────────────────────────────

export interface OrderResult {
  order: OrderSummary;
  subscription: SubscriptionView;
}

/**
 * Record a chosen plan as a *pending* order. Nothing is activated here: an
 * active customer stays active while an upgrade is unpaid, and a brand-new
 * customer stays locked out until the payment is verified.
 */
export async function selectPlan(
  ownerId: string,
  planId: string,
  billingPeriod: BillingPeriod,
): Promise<OrderResult> {
  const plan = planById(planId);
  if (!plan.active) throw planError('That plan is not available.');

  const current = await resolveSubscription(ownerId);
  if (current.isActive && current.planId === plan.id && current.billingPeriod === billingPeriod) {
    throw planError('You are already on this plan.');
  }

  const order = priceOrder(plan.id, billingPeriod, current.sitesUsed);

  if (current.isActive) {
    // Upgrade / downgrade: keep the live entitlement until the new plan is paid.
    await AccountModel.updateOne(
      { ownerId },
      { $set: { pendingPlanId: plan.id, pendingBillingPeriod: billingPeriod } },
    ).exec();
  } else {
    await AccountModel.updateOne(
      { ownerId },
      {
        $set: {
          planId: plan.id,
          billingPeriod,
          siteLimit: plan.siteLimit,
          siteLimitSource: SITE_LIMIT_PROVENANCE,
          subscriptionStatus: 'pending',
          pendingPlanId: null,
          pendingBillingPeriod: null,
        },
      },
    ).exec();
  }

  return { order, subscription: await resolveSubscription(ownerId) };
}

/** Plan + period the next payment would buy. */
function targetPlan(sub: SubscriptionView, planId?: string, billingPeriod?: BillingPeriod) {
  const plan = planById(planId ?? sub.pendingChange?.planId ?? sub.planId);
  const period = billingPeriod ?? sub.pendingChange?.billingPeriod ?? sub.billingPeriod;
  return { plan, period };
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface CheckoutResult {
  mode: 'stripe' | 'dev';
  payment: PaymentView;
  order: OrderSummary;
  url: string | null;
  note?: string;
}

/**
 * Create the payment attempt. Stripe returns a hosted checkout URL; without
 * keys the attempt is a labelled dev-mode payment that must still be confirmed
 * server-side (so activation never depends on a frontend "success" flag).
 */
export async function startCheckout(
  ownerId: string,
  options: { planId?: string; billingPeriod?: BillingPeriod; email?: string; baseUrl: string },
): Promise<CheckoutResult> {
  const sub = await resolveSubscription(ownerId);
  const { plan, period } = targetPlan(sub, options.planId, options.billingPeriod);
  const order = priceOrder(plan.id, period, sub.sitesUsed);

  // Reuse a recent pending dev payment so a double-click cannot create two rows.
  if (sub.pendingPaymentId && !stripeEnabled) {
    const existing = (await PaymentModel.findOne({ ownerId, id: sub.pendingPaymentId })
      .lean()
      .exec()) as Record<string, unknown> | null;
    if (existing && existing.planId === plan.id && existing.amountPence === order.totalPence) {
      return {
        mode: 'dev',
        payment: paymentView(existing),
        order,
        url: `/onboarding/payment?payment=${String(existing.id)}`,
        note: 'Stripe is not configured — this is a test-mode payment.',
      };
    }
  }

  const paymentId = randomId('pay');
  const provider: 'stripe' | 'dev' = stripeEnabled ? 'stripe' : 'dev';
  const providerRef = provider === 'dev' ? randomId('dev') : '';

  await PaymentModel.create({
    ownerId,
    id: paymentId,
    planId: plan.id,
    billingPeriod: period,
    provider,
    providerRef: providerRef || paymentId, // replaced by the Stripe session id below
    amountPence: order.totalPence,
    currency: 'GBP',
    status: 'pending',
    description: `${plan.name} — ${order.sites} site${order.sites > 1 ? 's' : ''} (${period})`,
    createdAt: nowIso(),
  });

  await AccountModel.updateOne(
    { ownerId },
    { $set: { subscriptionStatus: sub.isActive ? sub.status : 'payment_pending' } },
  ).exec();

  if (provider === 'stripe') {
    const { createCheckoutSession } = await import('../lib/billing/stripe.js');
    const session = await createCheckoutSession({
      plan,
      sites: order.sites,
      ownerId,
      email: options.email,
      successUrl: `${options.baseUrl}/onboarding/payment-status?payment=${paymentId}`,
      cancelUrl: `${options.baseUrl}/onboarding/payment-status?payment=${paymentId}&state=cancelled`,
      metadata: { paymentId, billingPeriod: period },
    });
    await PaymentModel.updateOne({ ownerId, id: paymentId }, { $set: { providerRef: session.id } }).exec();
    return {
      mode: 'stripe',
      payment: paymentView((await PaymentModel.findOne({ ownerId, id: paymentId }).lean().exec()) as Record<string, unknown>),
      order,
      url: session.url,
    };
  }

  return {
    mode: 'dev',
    payment: paymentView((await PaymentModel.findOne({ ownerId, id: paymentId }).lean().exec()) as Record<string, unknown>),
    order,
    url: `/onboarding/payment?payment=${paymentId}`,
    note: 'Stripe is not configured — this is a test-mode payment. It still has to be confirmed by the server.',
  };
}

function paymentError(message: string): Error & { code: 'payment' } {
  return Object.assign(new Error(message), { code: 'payment' as const });
}

/** Put an owner on a paid plan. Internal: only a verified payment may call this. */
async function activateSubscription(
  ownerId: string,
  opts: { planId: string; billingPeriod: BillingPeriod; paymentId: string },
): Promise<SubscriptionView> {
  const plan = planById(opts.planId);
  const start = new Date();
  const end = addMonths(start, opts.billingPeriod === 'annual' ? 12 : 1);
  await AccountModel.updateOne(
    { ownerId },
    {
      $set: {
        planId: plan.id,
        subscriptionStatus: 'active',
        billingPeriod: opts.billingPeriod,
        siteLimit: plan.siteLimit,
        siteLimitSource: SITE_LIMIT_PROVENANCE,
        currentPeriodStart: start.toISOString(),
        currentPeriodEnd: end.toISOString(),
        cancelAtPeriodEnd: false,
        pendingPlanId: null,
        pendingBillingPeriod: null,
        lastPaymentId: opts.paymentId,
      },
    },
    { upsert: true },
  ).exec();
  return resolveSubscription(ownerId);
}

/**
 * Confirm a payment. Idempotent: a replayed webhook or a double-clicked button
 * returns the current subscription instead of activating twice or extending the
 * period twice.
 */
export async function confirmPayment(
  ownerId: string,
  paymentId: string,
  options: { providerEventId?: string } = {},
): Promise<SubscriptionView> {
  const payment = (await PaymentModel.findOne({ ownerId, id: paymentId }).lean().exec()) as
    | Record<string, unknown>
    | null;
  if (!payment) throw paymentError('We could not find that payment.');

  if (payment.status === 'succeeded') return resolveSubscription(ownerId);
  if (payment.status === 'failed' || payment.status === 'cancelled') {
    throw paymentError('That payment failed or was cancelled. Start a new payment.');
  }

  // Conditional update: only one concurrent confirmation can win the transition.
  const settled = await PaymentModel.findOneAndUpdate(
    { ownerId, id: paymentId, status: 'pending' },
    {
      $set: {
        status: 'succeeded',
        paidAt: nowIso(),
        ...(options.providerEventId ? { providerEventId: options.providerEventId } : {}),
      },
    },
    { new: true },
  )
    .lean()
    .exec();

  if (!settled) {
    // Someone else settled it in the same instant — treat as success.
    const current = (await PaymentModel.findOne({ ownerId, id: paymentId }).lean().exec()) as
      | Record<string, unknown>
      | null;
    if (current?.status === 'succeeded') return resolveSubscription(ownerId);
    throw paymentError('That payment is no longer pending.');
  }

  return activateSubscription(ownerId, {
    planId: String(settled.planId),
    billingPeriod: asPeriod(settled.billingPeriod as string | undefined),
    paymentId,
  });
}

/** Mark a payment failed. Never unlocks anything. */
export async function failPayment(
  ownerId: string,
  paymentId: string,
  reason: string,
): Promise<SubscriptionView> {
  await PaymentModel.updateOne(
    { ownerId, id: paymentId, status: 'pending' },
    { $set: { status: 'failed', failureReason: reason } },
  ).exec();
  const account = await ensureAccount(ownerId);
  if (asStatus(account.subscriptionStatus) !== 'active') {
    await AccountModel.updateOne(
      { ownerId },
      { $set: { subscriptionStatus: 'failed' } },
    ).exec();
  }
  return resolveSubscription(ownerId);
}

/** Mark a payment cancelled (buyer backed out of checkout). */
export async function cancelPayment(ownerId: string, paymentId: string): Promise<SubscriptionView> {
  await PaymentModel.updateOne(
    { ownerId, id: paymentId, status: 'pending' },
    { $set: { status: 'cancelled' } },
  ).exec();
  const account = await ensureAccount(ownerId);
  const status = asStatus(account.subscriptionStatus);
  if (status !== 'active') {
    await AccountModel.updateOne(
      { ownerId },
      { $set: { subscriptionStatus: account.planId ? 'pending' : 'none' } },
    ).exec();
  }
  return resolveSubscription(ownerId);
}

/** Payment history for the billing page, newest first. */
export async function paymentHistory(ownerId: string, limit = 50): Promise<PaymentView[]> {
  const rows = (await PaymentModel.find({ ownerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec()) as Record<string, unknown>[];
  return rows.map(paymentView);
}

/** Cancel at period end — the customer keeps what they have paid for. */
export async function cancelSubscription(ownerId: string): Promise<SubscriptionView> {
  const sub = await resolveSubscription(ownerId);
  if (!sub.isActive) throw paymentError('There is no active subscription to cancel.');
  await AccountModel.updateOne(
    { ownerId },
    { $set: { subscriptionStatus: 'cancelled', cancelAtPeriodEnd: true } },
  ).exec();
  return resolveSubscription(ownerId);
}

/** Undo a scheduled cancellation before the period ends. */
export async function resumeSubscription(ownerId: string): Promise<SubscriptionView> {
  const sub = await resolveSubscription(ownerId);
  if (!sub.isActive || sub.status !== 'cancelled') {
    throw paymentError('There is no cancelled subscription to resume.');
  }
  await AccountModel.updateOne(
    { ownerId },
    { $set: { subscriptionStatus: 'active', cancelAtPeriodEnd: false } },
  ).exec();
  return resolveSubscription(ownerId);
}

/** The plan a live subscription is allowed to use (immutable snapshot fields). */
export async function ownerForSubscription(subscriptionId: string): Promise<string | null> {
  const doc = (await AccountModel.findOne({ stripeSubscriptionId: subscriptionId })
    .lean()
    .exec()) as { ownerId?: string } | null;
  return doc?.ownerId ?? null;
}

// ── Capacity (concurrency-safe) ───────────────────────────────────────────────

export type SlotReservation =
  | { ok: true; sitesUsed: number; remainingSites: number }
  | { ok: false; reason: 'capacity' | 'subscription'; subscription: SubscriptionView };

/**
 * Reserve one site slot before creating the site. The comparison and the
 * increment happen in a *single* atomic update, so two simultaneous requests can
 * never both take the last slot — no matter what the client sends.
 */
export async function reserveSiteSlot(ownerId: string): Promise<SlotReservation> {
  const sub = await resolveSubscription(ownerId);
  if (!sub.isActive) return { ok: false, reason: 'subscription', subscription: sub };
  if (sub.remainingSites <= 0) return { ok: false, reason: 'capacity', subscription: sub };

  // Raise (never lower) the counter to the number of site documents that really
  // exist, so rows written outside this path can never buy extra capacity. The
  // raise is conditional, so it cannot undo another request's reservation.
  const actual = await countSites(ownerId);
  await AccountModel.updateOne(
    { ownerId, $or: [{ sites: { $exists: false } }, { sites: { $lt: actual } }] },
    { $set: { sites: actual } },
  ).exec();

  const updated = await AccountModel.findOneAndUpdate(
    {
      ownerId,
      $expr: {
        $lt: [
          { $ifNull: ['$sites', 0] },
          { $ifNull: ['$siteLimit', sub.siteLimit] },
        ],
      },
    },
    { $inc: { sites: 1 } },
    { new: true },
  )
    .lean()
    .exec();

  if (!updated) {
    return { ok: false, reason: 'capacity', subscription: await resolveSubscription(ownerId) };
  }

  const reserved = typeof updated.sites === 'number' ? updated.sites : actual + 1;
  return {
    ok: true,
    sitesUsed: reserved,
    remainingSites: Math.max(0, sub.siteLimit - reserved),
  };
}

/** Give the slot back when site creation fails after a reservation. */
export async function releaseSiteSlot(ownerId: string): Promise<void> {
  await AccountModel.updateOne(
    { ownerId, sites: { $gt: 0 } },
    { $inc: { sites: -1 } },
  ).exec();
}

// ── Webhook idempotency ───────────────────────────────────────────────────────

/**
 * Record a provider event id once. Returns false for a replay, so a duplicate
 * delivery cannot activate a subscription twice.
 */
export async function recordWebhookEvent(eventId: string, type?: string): Promise<boolean> {
  try {
    await WebhookEventModel.create({ eventId, type });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}
