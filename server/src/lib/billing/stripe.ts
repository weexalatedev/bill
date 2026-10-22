/**
 * Stripe billing — minimal, SDK-free integration.
 *
 * The server only needs global `fetch`, matching the Anthropic/Gemini approach.
 * Two operations matter:
 *   1. Create a Checkout Session for a plan priced per site (quantity = sites).
 *   2. Verify and interpret the webhook that says payment succeeded.
 *
 * With no `STRIPE_SECRET_KEY`, `createCheckoutSession` throws a typed error and
 * the caller falls back to dev-mode activation — so the product is demoable
 * without taking a real payment.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, stripeEnabled } from '../../env.js';
import type { Plan } from '../../types.js';

export { stripeEnabled };

const STRIPE_API = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 15_000;

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface CheckoutError {
  code: 'not-configured' | 'stripe-error';
  message: string;
  status?: number;
}

/**
 * Create a Stripe Checkout Session for a monthly subscription at
 * `plan.pricePerSite` per site, with `sites` as the quantity.
 */
export async function createCheckoutSession(options: {
  plan: Plan;
  sites: number;
  ownerId: string;
  email?: string;
}): Promise<CheckoutSession> {
  if (!stripeEnabled) {
    throw Object.assign(new Error('Stripe is not configured.'), {
      code: 'not-configured' satisfies CheckoutError['code'],
    });
  }

  const quantity = Math.max(1, Math.round(options.sites));
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('success_url', `${env.stripe.appBaseUrl}/plans?checkout=success`);
  body.set('cancel_url', `${env.stripe.appBaseUrl}/plans?checkout=cancelled`);
  body.set('client_reference_id', options.ownerId);
  body.set('metadata[ownerId]', options.ownerId);
  body.set('metadata[planId]', options.plan.id);
  if (options.email) body.set('customer_email', options.email);
  body.set('line_items[0][quantity]', String(quantity));
  body.set('line_items[0][price_data][currency]', 'gbp');
  body.set('line_items[0][price_data][unit_amount]', String(options.plan.pricePerSite * 100));
  body.set('line_items[0][price_data][recurring][interval]', 'month');
  body.set('line_items[0][price_data][product_data][name]', `EnerOS ${options.plan.name}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.stripe.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
      },
      body: body.toString(),
      signal: controller.signal,
    });
    const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      throw Object.assign(
        new Error(json.error?.message ?? `Stripe returned ${res.status}.`),
        { code: 'stripe-error' satisfies CheckoutError['code'], status: res.status },
      );
    }
    return { id: json.id ?? '', url: json.url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a Stripe webhook signature (`t=...,v1=...`). Returns the parsed event
 * only when the HMAC matches; otherwise null. Mirrors Stripe's documented scheme
 * without pulling in the SDK.
 */
export function verifyAndParseEvent(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
  toleranceSeconds = 300,
): { type?: string; data?: { object?: Record<string, unknown> } } | null {
  if (!signatureHeader || !secret) return null;
  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) (acc[k] ??= []).push(v);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return null;

  // Reject stale events to limit replay.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isFinite(age) && age > toleranceSeconds) return null;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  const ok = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!ok) return null;

  try {
    return JSON.parse(payload) as { type?: string; data?: { object?: Record<string, unknown> } };
  } catch {
    return null;
  }
}
