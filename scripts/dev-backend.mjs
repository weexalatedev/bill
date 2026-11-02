#!/usr/bin/env node
/**
 * Starts the Python connector service (FastAPI) for `npm run dev:all`.
 *
 *   npm run dev:backend
 *
 * It loads the same repo-root `.env` the Node API and the Next.js app read, so
 * APP_API_TOKEN can never disagree between services, then runs uvicorn with the
 * `backend/.venv` interpreter created by `npm run setup`. Works on Windows
 * PowerShell and POSIX shells (no `export`, no shell-specific syntax).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');

// Root `.env` first (single source of truth), then `backend/.env` as a fallback.
// dotenv never overrides a variable that is already set, so real environment
// variables always win over either file.
loadEnv({ path: join(ROOT, '.env') });
loadEnv({ path: join(BACKEND, '.env') });

const HOST = '127.0.0.1';
const PORT = process.env.BACKEND_PORT || process.env.PYTHON_BACKEND_PORT || '8000';

const missing = ['APP_API_TOKEN', 'ENCRYPTION_KEY'].filter(
  (name) => !(process.env[name] || '').trim(),
);
if (missing.length > 0) {
  console.error(`
✗ The Python connector cannot start: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.

  Run this once from the repo root:

      npm run setup

  It creates .env from .env.example and generates ENCRYPTION_KEY.
  (The root .env is shared by the web app, the Node API and this service.)
`);
  process.exit(1);
}

// Prefer the virtualenv `npm run setup` creates; fall back to PATH with a hint.
const venvPython = process.platform === 'win32'
  ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
  : join(BACKEND, '.venv', 'bin', 'python');

let python = (process.env.PYTHON_BIN || '').trim();
if (!python) {
  if (existsSync(venvPython)) {
    python = venvPython;
  } else {
    python = process.platform === 'win32' ? 'python' : 'python3';
    console.warn(
      `! backend/.venv was not found — falling back to "${python}". ` +
        'Run `npm run setup` to create the virtualenv and install backend/requirements.txt.',
    );
  }
}

console.log(`Starting Python connector on http://${HOST}:${PORT} (uvicorn, auto-reload)`);

const child = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--host', HOST, '--port', String(PORT), '--reload'],
  { cwd: BACKEND, env: process.env, stdio: 'inherit' },
);

child.on('error', (error) => {
  console.error(`
✗ Could not run "${python}": ${error.message}

  Install Python 3.10+ and run "npm run setup" from the repo root, or point
  PYTHON_BIN at a specific interpreter.
`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
