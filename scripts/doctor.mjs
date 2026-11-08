#!/usr/bin/env node
/**
 * npm run doctor — preflight for the three-process stack.
 *
 * The most common setup failure is not a bug in the app: it is a missing
 * ENCRYPTION_KEY, a virtualenv that was never created, or an APP_API_TOKEN that
 * differs between the Node API and the Python connector. Each check below prints
 * the exact command that fixes it.
 *
 *   npm run doctor            # report; exit 1 only on hard failures
 *   npm run doctor -- --strict # also fail when the connector is not running
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const strict = process.argv.includes('--strict');

const results = [];
const pass = (label, detail = '') => results.push({ status: 'pass', label, detail });
const fail = (label, detail, fix) => results.push({ status: 'fail', label, detail, fix });
const warn = (label, detail, fix) => results.push({ status: 'warn', label, detail, fix });

// ── Node ─────────────────────────────────────────────────────────────────────
const nodeMajor = Number(process.versions.node.split('.')[0]);
const [needMajor, needMinor] = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines?.node ?? '>=20.9.0')
  .replace('>=', '')
  .split('.')
  .map(Number);
if (nodeMajor > needMajor || (nodeMajor === needMajor && Number(process.versions.node.split('.')[1]) >= needMinor)) {
  pass('Node version', process.versions.node);
} else {
  fail('Node version', `${process.versions.node} — need >= ${needMajor}.${needMinor}`, 'Install Node 20.9 or newer');
}

// ── .env ─────────────────────────────────────────────────────────────────────
const envPath = join(ROOT, '.env');
if (!existsSync(envPath)) {
  fail('.env exists', 'not found at the repo root', 'npm run setup');
} else {
  pass('.env exists');
}

const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    )
  : {};

const token = (process.env.APP_API_TOKEN ?? env.APP_API_TOKEN ?? '').trim();
if (!token) {
  fail('APP_API_TOKEN', 'not set in .env', 'Add APP_API_TOKEN to .env (npm run setup writes a dev default)');
} else {
  pass('APP_API_TOKEN', `${token.slice(0, 4)}… (${token.length} chars)`);
}

// A Fernet key is 32 url-safe-base64 bytes — 44 characters ending in "=".
const key = (process.env.ENCRYPTION_KEY ?? env.ENCRYPTION_KEY ?? '').trim();
if (!key) {
  fail(
    'ENCRYPTION_KEY',
    'not set — the connector cannot encrypt supplier credentials',
    'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  → paste into .env',
  );
} else if (!/^[A-Za-z0-9_-]{43}=$/.test(key)) {
  fail('ENCRYPTION_KEY', `${key.length} chars — not a Fernet key`, 'Regenerate it: npm run setup rewrites an invalid key');
} else {
  pass('ENCRYPTION_KEY', '44-char Fernet key');
}

// ── Python + virtualenv ──────────────────────────────────────────────────────
const venvPython =
  process.platform === 'win32'
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');

if (!existsSync(venvPython)) {
  fail('backend/.venv', 'not created', 'npm run setup  (creates the venv and installs backend/requirements.txt)');
} else {
  pass('backend/.venv', venvPython.replace(ROOT, '.'));
  const probe = spawnSync(
    venvPython,
    ['-c', 'import fastapi, uvicorn, httpx, cryptography; print(fastapi.__version__)'],
    { encoding: 'utf8' },
  );
  if (probe.status === 0) {
    pass('python dependencies', `fastapi ${probe.stdout.trim()}`);
  } else {
    fail(
      'python dependencies',
      (probe.stderr || 'import failed').split('\n').filter(Boolean).slice(-1)[0] ?? 'import failed',
      'backend/.venv/bin/python -m pip install -r backend/requirements.txt',
    );
  }
}

// ── Services ─────────────────────────────────────────────────────────────────
const backendUrl = (process.env.PYTHON_BACKEND_URL ?? env.PYTHON_BACKEND_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');

async function head(url, init) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch {
    return null;
  }
}

const openapi = await head(`${backendUrl}/openapi.json`);
if (openapi?.ok) {
  pass('Python connector', `reachable at ${backendUrl}`);

  const probe = await head(`${backendUrl}/v1/homes/__doctor__/devices`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!probe) {
    warn('connector token', 'no response to the authenticated probe', 'Check APP_API_TOKEN in .env');
  } else if (probe.status === 401) {
    fail(
      'connector token',
      'APP_API_TOKEN rejected (401) — the API and the connector disagree',
      'Restart both with npm run dev:all so they read the same root .env',
    );
  } else {
    pass('connector token', `accepted (probe returned ${probe.status})`);
  }
} else {
  warn(
    'Python connector',
    `not reachable at ${backendUrl}`,
    'npm run dev:all   (or: npm run dev:backend in its own terminal)',
  );
}

const api = await head(`${apiUrl}/api/health`);
if (api?.ok) {
  const body = await api.json().catch(() => ({}));
  pass('Node API', `${apiUrl} — db ${body.db ? 'up' : 'down'}`);
} else {
  warn('Node API', `not reachable at ${apiUrl}`, 'npm run dev:api   (or use npm run dev:all)');
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('\nEnerOS doctor\n');
for (const result of results) {
  const icon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '!' : '✗';
  console.log(`${icon} ${result.label}${result.detail ? ` — ${result.detail}` : ''}`);
  if (result.fix && result.status !== 'pass') console.log(`    fix: ${result.fix}`);
}

const hard = results.filter((r) => r.status === 'fail').length;
const soft = results.filter((r) => r.status === 'warn').length;
console.log(`\n${results.length - hard - soft} ok · ${soft} warning${soft === 1 ? '' : 's'} · ${hard} blocking\n`);

if (hard > 0 || (strict && soft > 0)) process.exit(1);
