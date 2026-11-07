/**
 * verify-subscription — the whole SaaS journey, end to end, against an in-memory
 * MongoDB:
 *
 *   register → locked out → choose plan → pay (test mode) → verify → dashboard
 *   → add sites up to the plan cap → block → concurrency → tenant isolation
 *   → failed / cancelled / expired / upgrade / downgrade → webhook idempotency.
 *
 *   cd server && npm run verify:subscription
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.MONGODB_URI = '';

const { MongoMemoryServer } = await import('mongodb-memory-server');

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('eneros-verify');

const { connectDb, disconnectDb } = await import('../db.js');
const { default: app } = await import('../app.js');
const { AccountModel, PaymentModel, SiteModel } = await import('../models/index.js');

await connectDb();

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; raw?: { body: string; signature: string } } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let payload: string | undefined;
  if (options.raw) {
    payload = options.raw.body;
    headers['stripe-signature'] = options.raw.signature;
    headers['Content-Type'] = 'application/json';
  } else if (options.body !== undefined) {
    payload = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body };
}

const unique = Date.now().toString(36);
const password = 'Sup3r-secret-pass';

async function registerUser(suffix: string): Promise<{ token: string; email: string }> {
  const email = `owner-${suffix}-${unique}@example.com`;
  const res = await call('POST', '/api/auth/register', {
    body: { email, password, name: `Owner ${suffix}` },
  });
  assert.equal(res.status, 201, `register ${email} → ${res.status} ${JSON.stringify(res.body)}`);
  return { token: String(res.body.token), email };
}

const site = (name: string) => ({
  name,
  city: 'Bristol',
  region: 'South West',
  type: 'Restaurant',
  meterType: 'Smart',
  loads: [],
});

function signEvent(event: Record<string, unknown>): { body: string; signature: string } {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET as string)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return { body, signature: `t=${timestamp},v1=${signature}` };
}

async function subscribe(
  token: string,
  planId: string,
  action: 'confirm' | 'fail' | 'cancel' = 'confirm',
): Promise<Record<string, unknown>> {
  const selected = await call('POST', '/api/subscription/select', {
    token,
    body: { planId, billingPeriod: 'monthly' },
  });
  assert.equal(selected.status, 200, `select ${planId} → ${selected.status}`);
  const checkout = await call('POST', '/api/subscription/checkout', { token, body: {} });
  assert.equal(checkout.status, 200, `checkout → ${checkout.status} ${JSON.stringify(checkout.body)}`);
  const payment = checkout.body.payment as { id: string };
  const settled = await call('POST', `/api/subscription/payments/${payment.id}/${action}`, {
    token,
    body: {},
  });
  assert.equal(settled.status, 200, `${action} → ${settled.status} ${JSON.stringify(settled.body)}`);
  return settled.body.subscription as Record<string, unknown>;
}

// ── 1. Public catalogue ───────────────────────────────────────────────────────
console.log('\n1. Public plan catalogue');
{
  const res = await call('GET', '/api/plans');
  const plans = res.body.plans as { id: string; pricePerSite: number; siteLimit: number }[];
  check('plans are public (no auth)', res.status === 200);
  check(
    'three plans, in README order',
    plans.map((p) => p.id).join(',') === 'starter,growth,autonomous',
  );
  check(
    'prices match README (£49/£149/£249)',
    plans.map((p) => p.pricePerSite).join(',') === '49,149,249',
  );
  check(
    'site caps come from the catalogue',
    plans.every((p) => typeof p.siteLimit === 'number' && p.siteLimit > 0),
  );
  check('annual billing reported as unavailable (not invented)', res.body.annualBillingAvailable === false);
  check('the recommended plan is explicit', res.body.recommendedPlanId === 'growth');
  check('site caps are labelled provisional', res.body.siteLimitSource === 'provisional');
}

// ── 2. Registration → locked out ──────────────────────────────────────────────
console.log('\n2. Register, then prove the dashboard is locked');
const alice = await registerUser('alice');
{
  const duplicate = await call('POST', '/api/auth/register', {
    body: { email: alice.email, password, name: 'Alice again' },
  });
  check('duplicate registration rejected', duplicate.status === 409, String(duplicate.status));

  const status = await call('GET', '/api/subscription/status', { token: alice.token });
  const sub = status.body.subscription as Record<string, unknown>;
  check('new account starts at status "none"', sub.status === 'none');
  check('new account is not active', sub.isActive === false);
  check('site capacity is zero until paid', sub.canAddSite === false);

  const workspace = await call('GET', '/api/workspace', { token: alice.token });
  check('workspace is blocked before payment (402)', workspace.status === 402, String(workspace.status));
  check('the block carries a stable code', workspace.body.code === 'subscription_required');

  const earlySite = await call('POST', '/api/workspace/sites', {
    token: alice.token,
    body: site('Too early'),
  });
  check('sites cannot be added before payment', earlySite.status === 402, String(earlySite.status));

  const noAuth = await call('GET', '/api/workspace');
  check('workspace needs authentication (401)', noAuth.status === 401);
}

// ── 3. Plan selection (pending, never active) ────────────────────────────────
console.log('\n3. Select a plan — pending, not active');
{
  const res = await call('POST', '/api/subscription/select', {
    token: alice.token,
    body: { planId: 'growth', billingPeriod: 'monthly' },
  });
  const order = res.body.order as Record<string, number>;
  const sub = res.body.subscription as Record<string, unknown>;
  check('selection returns an order summary', res.status === 200);
  check('order bills per site, per month', order.pricePerSite === 149 && order.subtotal === 149);
  check('order adds VAT at 20%', order.vat === 29.8 && order.total === 178.8);
  check('selection is pending', sub.status === 'pending');
  check('selection does not activate', sub.isActive === false);
  check('plan capacity is staged but unusable', sub.canAddSite === false);

  const workspace = await call('GET', '/api/workspace', { token: alice.token });
  check('dashboard still locked after selecting', workspace.status === 402);

  const annual = await call('POST', '/api/subscription/select', {
    token: alice.token,
    body: { planId: 'growth', billingPeriod: 'annual' },
  });
  check('annual billing is refused, not invented', annual.status === 400, String(annual.status));
}

// ── 4. Verified payment unlocks the dashboard ────────────────────────────────
console.log('\n4. Pay → verify → dashboard');
let aliceSiteIds: string[] = [];
{
  const checkout = await call('POST', '/api/subscription/checkout', { token: alice.token, body: {} });
  const payment = checkout.body.payment as { id: string; status: string; amountPence: number };
  check('checkout creates a pending payment', checkout.status === 200 && payment.status === 'pending');
  check('test-mode checkout is labelled', checkout.body.mode === 'dev' && Boolean(checkout.body.note));
  check('amount charged matches the order (incl. VAT)', payment.amountPence === 17880, String(payment.amountPence));

  const stillLocked = await call('GET', '/api/workspace', { token: alice.token });
  check('dashboard still locked while payment is pending', stillLocked.status === 402, String(stillLocked.status));

  const confirmed = await call('POST', `/api/subscription/payments/${payment.id}/confirm`, {
    token: alice.token,
    body: {},
  });
  const sub = confirmed.body.subscription as Record<string, unknown>;
  check('confirmation activates the subscription', sub.status === 'active' && sub.isActive === true);
  check('plan is recorded', sub.planId === 'growth');
  check('renewal date is one month ahead', (() => {
    const end = new Date(String(sub.currentPeriodEnd)).getTime();
    const days = (end - Date.now()) / 86_400_000;
    return days > 27 && days < 32;
  })());
  check('capacity is the plan\'s site cap', sub.siteLimit === 10);

  const workspace = await call('GET', '/api/workspace', { token: alice.token });
  const ws = workspace.body.workspace as { account: { planId: string }; sites: unknown[] };
  check('dashboard now opens', workspace.status === 200);
  check('workspace reflects the paid plan', ws.account.planId === 'growth');
  check('a new customer starts with no sample sites', ws.sites.length === 0);

  const replay = await call('POST', `/api/subscription/payments/${payment.id}/confirm`, {
    token: alice.token,
    body: {},
  });
  check('re-confirming is idempotent', replay.status === 200 && (replay.body.subscription as { status: string }).status === 'active');
}

// ── 5. Site cap ───────────────────────────────────────────────────────────────
console.log('\n5. Site cap on the paid plan');
{
  for (let index = 1; index <= 10; index += 1) {
    const created = await call('POST', '/api/workspace/sites', {
      token: alice.token,
      body: site(`Alice site ${index}`),
    });
    assert.equal(created.status, 201, `site ${index} → ${created.status} ${JSON.stringify(created.body)}`);
    aliceSiteIds.push(String((created.body.site as { id: string }).id));
  }
  check('10 sites added on a 10-site plan', aliceSiteIds.length === 10);

  const over = await call('POST', '/api/workspace/sites', {
    token: alice.token,
    body: site('One too many'),
  });
  check('the 11th site is blocked', over.status === 403, String(over.status));
  check('the block explains the upgrade path', over.body.code === 'site_limit_reached' && String(over.body.error).includes('Upgrade your plan'));
  check('capacity reports 10/10 used', (over.body.subscription as { remainingSites: number; sitesUsed: number }).sitesUsed === 10);

  const after = await call('GET', '/api/workspace', { token: alice.token });
  check('no site was written when blocked', ((after.body.workspace as { sites: unknown[] }).sites.length) === 10);
}

// ── 6. Concurrency: parallel adds cannot exceed the cap ──────────────────────
console.log('\n6. Concurrent site creation on a 3-site plan');
const bob = await registerUser('bob');
{
  await subscribe(bob.token, 'starter');
  const attempts = await Promise.all(
    Array.from({ length: 8 }, (_unused, index) =>
      call('POST', '/api/workspace/sites', { token: bob.token, body: site(`Bob site ${index}`) }),
    ),
  );
  const created = attempts.filter((r) => r.status === 201).length;
  const blocked = attempts.filter((r) => r.status === 403).length;
  check('exactly the plan cap succeeds', created === 3, `created=${created}`);
  check('the rest are rejected', blocked === 5, `blocked=${blocked}`);
  check('stored sites match the cap', (await SiteModel.countDocuments({ ownerId: `user:${bob.email}` })) === 3);
}

// ── 7. Failed and cancelled payments unlock nothing ─────────────────────────
console.log('\n7. Failed / cancelled payments');
{
  const carol = await registerUser('carol');
  const failedSub = await subscribe(carol.token, 'starter', 'fail');
  check('a failed payment leaves the account inactive', failedSub.isActive === false && failedSub.status === 'failed');
  const locked = await call('GET', '/api/workspace', { token: carol.token });
  check('a failed payment grants no dashboard access', locked.status === 402);

  const dave = await registerUser('dave');
  const cancelledSub = await subscribe(dave.token, 'growth', 'cancel');
  check('a cancelled checkout leaves the account inactive', cancelledSub.isActive === false);
  const daveLocked = await call('GET', '/api/workspace', { token: dave.token });
  check('a cancelled checkout grants no dashboard access', daveLocked.status === 402);

  const retried = await subscribe(dave.token, 'growth');
  check('retry after cancelling does activate', retried.isActive === true && retried.planId === 'growth');
}

// ── 8. Webhook: signature, amount, idempotency ──────────────────────────────
console.log('\n8. Payment-provider webhook');
{
  const erin = await registerUser('erin');
  await call('POST', '/api/subscription/select', {
    token: erin.token,
    body: { planId: 'growth', billingPeriod: 'monthly' },
  });
  const checkout = await call('POST', '/api/subscription/checkout', { token: erin.token, body: {} });
  const payment = checkout.body.payment as { id: string; amountPence: number };
  const ownerId = `user:${erin.email}`;

  const event = {
    id: `evt_${unique}_erin`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_erin',
        client_reference_id: ownerId,
        payment_status: 'paid',
        amount_total: payment.amountPence,
        metadata: { ownerId, planId: 'growth', paymentId: payment.id },
      },
    },
  };

  const unsigned = await call('POST', '/api/billing/webhook', {
    raw: { body: JSON.stringify(event), signature: 't=1,v1=deadbeef' },
  });
  check('unsigned webhook is rejected', unsigned.status === 400, String(unsigned.status));

  const signed = signEvent(event);
  const ok = await call('POST', '/api/billing/webhook', { raw: signed });
  check('signed webhook is accepted', ok.status === 200 && ok.body.received === true);

  const afterWebhook = (await call('GET', '/api/subscription/status', { token: erin.token })).body
    .subscription as Record<string, unknown>;
  check('webhook activates the subscription', afterWebhook.isActive === true);

  const replay = await call('POST', '/api/billing/webhook', { raw: signed });
  const replaySub = (await call('GET', '/api/subscription/status', { token: erin.token })).body
    .subscription as Record<string, unknown>;
  check('replayed event is recognised as a duplicate', replay.body.duplicate === true);
  check('replay does not extend the period', replaySub.currentPeriodEnd === afterWebhook.currentPeriodEnd);

  const frank = await registerUser('frank');
  await call('POST', '/api/subscription/select', { token: frank.token, body: { planId: 'growth' } });
  const frankCheckout = await call('POST', '/api/subscription/checkout', { token: frank.token, body: {} });
  const frankPayment = frankCheckout.body.payment as { id: string };
  const tampered = signEvent({
    id: `evt_${unique}_frank`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_frank',
        payment_status: 'paid',
        amount_total: 1,
        metadata: { ownerId: `user:${frank.email}`, planId: 'growth', paymentId: frankPayment.id },
      },
    },
  });
  await call('POST', '/api/billing/webhook', { raw: tampered });
  const frankSub = (await call('GET', '/api/subscription/status', { token: frank.token })).body
    .subscription as Record<string, unknown>;
  check('an amount mismatch never activates', frankSub.isActive === false);
}

// ── 9. Upgrade and downgrade ────────────────────────────────────────────────
console.log('\n9. Upgrade / downgrade');
{
  const selected = await call('POST', '/api/subscription/select', {
    token: alice.token,
    body: { planId: 'autonomous', billingPeriod: 'monthly' },
  });
  check('upgrade is staged as a pending change', selected.status === 200);
  const staged = (await call('GET', '/api/subscription/status', { token: alice.token })).body
    .subscription as Record<string, unknown>;
  check('the live plan still applies until payment', staged.planId === 'growth' && staged.isActive === true);
  check('the pending change is visible', (staged.pendingChange as { planId: string }).planId === 'autonomous');

  const upgraded = await subscribe(alice.token, 'autonomous');
  check('upgrade activates after payment', upgraded.planId === 'autonomous' && upgraded.siteLimit === 25);
  check('upgrade keeps the existing sites', upgraded.sitesUsed === 10);

  const downgraded = await subscribe(alice.token, 'starter');
  check('downgrade activates after payment', downgraded.planId === 'starter' && downgraded.siteLimit === 3);
  check('downgrade keeps every site (no silent deletion)',
    (await SiteModel.countDocuments({ ownerId: `user:${alice.email}` })) === 10);
  check('over-cap after downgrade blocks new sites', downgraded.canAddSite === false);
  const blocked = await call('POST', '/api/workspace/sites', { token: alice.token, body: site('After downgrade') });
  check('the API refuses to add while over cap', blocked.status === 403);
}

// ── 10. Expiry ──────────────────────────────────────────────────────────────
console.log('\n10. Expiry');
{
  const ownerId = `user:${bob.email}`;
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await AccountModel.updateOne({ ownerId }, { $set: { currentPeriodEnd: past } });
  const sub = (await call('GET', '/api/subscription/status', { token: bob.token })).body
    .subscription as Record<string, unknown>;
  check('an elapsed period resolves to expired', sub.status === 'expired' && sub.isActive === false);
  const locked = await call('GET', '/api/workspace', { token: bob.token });
  check('expired subscriptions lose dashboard access', locked.status === 402);
  check('sites survive expiry', (await SiteModel.countDocuments({ ownerId })) === 3);

  const renewed = await subscribe(bob.token, 'starter');
  check('renewal works from expired', renewed.isActive === true && renewed.planId === 'starter');
}

// ── 11. Tenant isolation ────────────────────────────────────────────────────
console.log('\n11. Tenant isolation');
{
  const bobWorkspace = (await call('GET', '/api/workspace', { token: bob.token })).body.workspace as {
    sites: { id: string; name: string }[];
  };
  const aliceWorkspace = (await call('GET', '/api/workspace', { token: alice.token })).body.workspace as {
    sites: { id: string }[];
  };
  const bobSiteIds = new Set(bobWorkspace.sites.map((s) => s.id));
  check('each tenant only sees its own sites', aliceWorkspace.sites.every((s) => !bobSiteIds.has(s.id)));

  const hijack = await call('PATCH', `/api/workspace/sites/${bobWorkspace.sites[0].id}`, {
    token: alice.token,
    body: { name: 'Hijacked' },
  });
  check("another tenant cannot edit a site by id", hijack.status === 404, String(hijack.status));

  const alicePayments = (await call('GET', '/api/subscription/payments', { token: alice.token })).body
    .payments as { id: string }[];
  const bobPayments = (await call('GET', '/api/subscription/payments', { token: bob.token })).body
    .payments as { id: string }[];
  const bobPaymentIds = new Set(bobPayments.map((p) => p.id));
  check('payment history never leaks across tenants', alicePayments.every((p) => !bobPaymentIds.has(p.id)));
}

// ── 12. Payment history ─────────────────────────────────────────────────────
console.log('\n12. Payment history');
{
  const payments = (await call('GET', '/api/subscription/payments', { token: alice.token })).body
    .payments as { status: string; amountPence: number; planId: string }[];
  check('history lists every attempt', payments.length >= 3, String(payments.length));
  check('history records the verified amount', payments.some((p) => p.status === 'succeeded' && p.amountPence === 58800));
  check('history is newest first', payments[0].status === 'succeeded' && payments[0].planId === 'starter');
}

// ── Summary ─────────────────────────────────────────────────────────────────
await disconnectDb();
server.close();
await mongod.stop();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
