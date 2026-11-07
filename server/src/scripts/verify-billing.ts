/**
 * verify-billing — Stripe checkout + webhook signature, offline.
 *
 *   npm run verify:billing
 */

process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.APP_BASE_URL = 'http://localhost:5173';

import { createHmac } from 'node:crypto';

const { createCheckoutSession, verifyAndParseEvent } = await import('../lib/billing/stripe.js');
import type { Plan } from '../types.js';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const plan = {
  id: 'growth',
  name: 'Growth',
  pricePerSite: 149,
  tagline: 'x',
  features: [],
} as unknown as Plan;

async function runCheckout(): Promise<void> {
  console.log('\nCheckout session');
  let capturedUrl = '';
  let capturedBody = '';

  globalThis.fetch = (async (url: string, init: { body?: string }) => {
    capturedUrl = String(url);
    capturedBody = String(init.body ?? '');
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
      text: async () => '',
    };
  }) as unknown as typeof fetch;

  const session = await createCheckoutSession({ plan, sites: 5, ownerId: 'clerk:abc', email: 'a@b.com' });
  const params = new URLSearchParams(capturedBody);

  check('hits the Stripe checkout endpoint', capturedUrl.endsWith('/checkout/sessions'), capturedUrl);
  check('returns the hosted URL', session.url.includes('checkout.stripe.com'), session.url);
  check('uses subscription mode', params.get('mode') === 'subscription');
  check('prices per site in pence', params.get('line_items[0][price_data][unit_amount]') === '14900', params.get('line_items[0][price_data][unit_amount]') ?? '');
  check('quantity is the site count', params.get('line_items[0][quantity]') === '5', params.get('line_items[0][quantity]') ?? '');
  check('currency is GBP', params.get('line_items[0][price_data][currency]') === 'gbp');
  check('carries the owner id for the webhook', params.get('metadata[ownerId]') === 'clerk:abc');
  check('carries the plan id for the webhook', params.get('metadata[planId]') === 'growth');
  check('returns to the payment-status page', (params.get('success_url') ?? '').includes('/onboarding/payment-status'), params.get('success_url') ?? '');
  check('cancel path carries the cancelled state', (params.get('cancel_url') ?? '').includes('state=cancelled'), params.get('cancel_url') ?? '');
  check('never sends the secret in the body', !capturedBody.includes('sk_test_123'));

  // Stripe error path
  globalThis.fetch = (async () => ({
    ok: false,
    status: 402,
    json: async () => ({ error: { message: 'Your card was declined.' } }),
    text: async () => '',
  })) as unknown as typeof fetch;
  let errored = '';
  try {
    await createCheckoutSession({ plan, sites: 1, ownerId: 'clerk:abc' });
  } catch (error) {
    errored = (error as { code?: string }).code ?? 'unknown';
  }
  check('surfaces Stripe errors with a code', errored === 'stripe-error', errored);
}

function sign(payload: string, timestamp: number, secret: string): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

function runWebhook(): void {
  console.log('\nWebhook signature');
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { metadata: { ownerId: 'clerk:abc', planId: 'growth' }, customer: 'cus_1', subscription: 'sub_1' } },
  });
  const now = Math.floor(Date.now() / 1000);

  const ok = verifyAndParseEvent(payload, sign(payload, now, secret), secret);
  check('accepts a valid signature', Boolean(ok) && ok?.type === 'checkout.session.completed', JSON.stringify(ok));

  const tampered = payload.replace('growth', 'autonomous');
  check('rejects a tampered body', verifyAndParseEvent(tampered, sign(payload, now, secret), secret) === null);

  check('rejects a wrong secret', verifyAndParseEvent(payload, sign(payload, now, 'wrong'), secret) === null);
  check('rejects a stale timestamp', verifyAndParseEvent(payload, sign(payload, now - 10_000, secret), secret) === null);
  check('rejects a missing header', verifyAndParseEvent(payload, undefined, secret) === null);
  check('rejects a malformed header', verifyAndParseEvent(payload, 'garbage', secret) === null);
  check('rejects an empty secret', verifyAndParseEvent(payload, sign(payload, now, secret), '') === null);
}

async function main(): Promise<void> {
  console.log('EnerOS billing verification');
  await runCheckout();
  runWebhook();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
