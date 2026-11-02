/**
 * End-to-end smoke test for the EnerOS API.
 *
 *   cd server && npm run smoke
 *
 * Boots an in-memory MongoDB, seeds the demo workspace, starts the API on an
 * ephemeral port and exercises auth, workspace, invoice audit, action
 * progression, control mode and recovery — proving web + mobile share one source
 * of truth. Cloudflare R2 is skipped unless R2_* env vars are configured.
 */
import type { AddressInfo } from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  // ── Force a clean dev-auth, in-memory environment ─────────────────────────
  // `env.js` reads process.env at import time, and `server/.env` (committed) ships
  // with real Clerk + R2 keys. To make this smoke test self-contained and
  // repeatable (it verifies the dev-auth + rules-only + in-memory feature stack
  // end to end), clear the cloud credentials and supply dev-only values BEFORE any
  // server module imports env:
  const mongod = await MongoMemoryServer.create();
  process.env.CLERK_PUBLISHABLE_KEY = '';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = '';
  process.env.CLERK_SECRET_KEY = '';
  process.env.R2_ACCOUNT_ID = '';
  process.env.R2_ACCESS_KEY_ID = '';
  process.env.R2_SECRET_ACCESS_KEY = '';
  process.env.R2_BUCKET = '';
  // devAuthSecret is required by auth.ts to sign tokens; supply a dev-only value.
  process.env.DEV_AUTH_SECRET = 'smoke-dev-secret';
  // dev-auth credentials (must exist for `env.demo` to resolve non-empty, which
  // `auth.ts` needs to sign tokens).
  process.env.DEMO_EMAIL = 'demo@eneros.app';
  process.env.DEMO_PASSWORD = 'EnerOS-demo-2026';
  process.env.MONGODB_URI = mongod.getUri('eneros');

  const { connectDb, disconnectDb } = await import('../db.js');
  const { env } = await import('../env.js');
  const { ownerIdFromEmail } = await import('../auth.js');
  const { provisionWorkspace } = await import('../services/workspace.js');
  const { createApp } = await import('../app.js');

  await connectDb();
  await provisionWorkspace(ownerIdFromEmail(env.demo.email), true);

  const servers = createApp().listen(0);
  await new Promise((resolve) => servers.once('listening', resolve));
  const { port } = servers.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const api = async (
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<{ status: number; body: any }> => {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { ...init, headers });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  // 1. Health + config
  const health = await api('/api/health');
  check('health endpoint', health.status === 200 && health.body.ok === true);
  check('mongo connected', health.body.db === true);
  check('auth mode is dev', health.body.auth === 'dev', `storage=${health.body.storage}`);

  const config = await api('/api/config');
  check('config exposes demo login', config.body.authMode === 'dev' && !!config.body.demo.email);

  // 2. Unauthorised access is rejected
  const unauth = await api('/api/workspace');
  check('workspace rejects anonymous', unauth.status === 401);

  // 3. Demo login
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: env.demo.email, password: env.demo.password }),
  });
  check('demo login succeeds', login.status === 200 && !!login.body.token);
  const token: string = login.body.token;

  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: env.demo.email, password: 'wrong' }),
  });
  check('wrong password rejected', badLogin.status === 401);

  // 4. Workspace is seeded and scoped to the demo owner
  const ws = await api('/api/workspace', {}, token);
  const workspace = ws.body.workspace;
  check('workspace loads', ws.status === 200);
  check('12 sites seeded', workspace.sites.length === 12);
  check('12 months of history', workspace.monthly.length === 12);
  check('actions seeded', workspace.actions.length > 0, `${workspace.actions.length} actions`);
  check('invoices seeded', workspace.invoices.length > 0, `${workspace.invoices.length} invoices`);
  check('plans + suppliers served', workspace.plans.length === 3 && workspace.suppliers.length === 9);
  check('control mode default', workspace.controlMode === 'Approve');
  check(
    'dashboard reconciles (£10,180 saved)',
    workspace.sites.reduce((s: number, x: any) => s + x.monthActual, 0) === 81420 &&
      workspace.sites.reduce((s: number, x: any) => s + x.monthExpected, 0) === 91600,
  );

  // 5. Invoice audit + recovery
  const created = await api(
    '/api/invoices',
    {
      method: 'POST',
      body: JSON.stringify({
        siteId: 's1',
        supplier: 'British Gas Lite',
        period: 'Apr 2026',
        consumptionKwh: 60000,
        unitRateP: 27.6,
        standingChargeP: 110,
      }),
    },
    token,
  );
  const invoice = created.body.invoice;
  check(
    'invoice audit creates a flagged invoice',
    created.status === 201 && invoice.status === 'Flagged',
  );
  check(
    'audit found issues',
    Array.isArray(invoice.issues) && invoice.issues.length > 0,
    invoice.issues?.map((i: any) => i.type).join(', '),
  );

  const recovered = await api(`/api/invoices/${invoice.id}/recover`, { method: 'POST' }, token);
  check(
    'invoice recovery',
    recovered.status === 200 && recovered.body.invoice.status === 'Recovered',
  );

  // 6. Action progression (pick a fresh 'Recommended' action)
  const freshAction = workspace.actions.find((a: any) => a.status === 'Recommended');
  check('seeded data includes a recommended action', !!freshAction);
  const actionId = freshAction.id;
  const advanced = await api(`/api/actions/${actionId}/advance`, { method: 'POST' }, token);
  check('action advanced to Approved', advanced.body.action.status === 'Approved');
  const advanced2 = await api(`/api/actions/${actionId}/advance`, { method: 'POST' }, token);
  check('action advanced to Automated', advanced2.body.action.status === 'Automated');

  // 7. Control mode persists
  const mode = await api(
    '/api/workspace/control-mode',
    { method: 'PUT', body: JSON.stringify({ mode: 'Automate' }) },
    token,
  );
  check('control mode updated', mode.status === 200 && mode.body.controlMode === 'Automate');
  const ws2 = await api('/api/workspace', {}, token);
  check('control mode persisted', ws2.body.workspace.controlMode === 'Automate');

  // 8. Uploads endpoint degrades gracefully when R2 is not configured
  const uploads = await api('/api/uploads', {}, token);
  check(
    'uploads endpoint responds',
    uploads.status === 200 || uploads.status === 503,
    `status=${uploads.status} (R2 ${uploads.status === 503 ? 'not configured' : 'configured'})`,
  );

  servers.close();
  await disconnectDb();
  await mongod.stop();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error('FAILED:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('✗ Smoke test crashed:', error);
  process.exit(1);
});
