#!/usr/bin/env node
/**
 * One-shot local setup for the whole monorepo.
 *
 *   npm run setup
 *   npm run setup -- --skip-node      # Python side only
 *   npm run setup -- --skip-python    # Node side only
 *
 * What it does (idempotent — safe to re-run):
 *   1. creates the repo-root `.env` from `.env.example` and fills in a Fernet
 *      ENCRYPTION_KEY (plus dev defaults for APP_API_TOKEN / PYTHON_BACKEND_URL)
 *   2. `npm install` in the repo root and in `server/`
 *   3. creates `backend/.venv` with Python 3.10+
 *   4. `pip install -r backend/requirements.txt`
 *
 * Written in plain Node (no shell syntax) so it behaves the same in Windows
 * PowerShell, cmd, Git Bash and macOS/Linux shells.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const SERVER = join(ROOT, 'server');
const ENV_PATH = join(ROOT, '.env');
const ENV_EXAMPLE = join(ROOT, '.env.example');

const flags = new Set(process.argv.slice(2));
const skipNode = flags.has('--skip-node');
const skipPython = flags.has('--skip-python');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const log = (message) => console.log(`\n▶ ${message}`);
const ok = (message) => console.log(`  ✓ ${message}`);
const warn = (message) => console.log(`  ! ${message}`);

function run(command, args, cwd, { shell = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env, shell });
  if (result.error) throw new Error(`could not run \`${command}\`: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`\`${[command, ...args].join(' ')}\` failed (exit code ${result.status})`);
  }
}

/** URLsafe base64 of 32 random bytes — exactly what `cryptography.fernet` expects. */
function generateEncryptionKey() {
  return randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function lineEnding(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Make sure `NAME` exists in the env file and has a non-empty value.
 * Returns { content, changed } so the caller can report what happened.
 */
function ensureValue(content, name, fallback) {
  const pattern = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, 'm');
  const match = content.match(pattern);

  if (!match) {
    const eol = lineEnding(content);
    return {
      content: `${content.replace(/\s*$/, '')}${eol}${name}=${fallback}${eol}`,
      changed: 'added',
    };
  }
  if (match[1].trim().length > 0) return { content, changed: null };
  return { content: content.replace(pattern, `${name}=${fallback}`), changed: 'filled' };
}

function setupEnvFile() {
  log('Environment file (.env)');

  if (!existsSync(ENV_PATH)) {
    if (!existsSync(ENV_EXAMPLE)) throw new Error('missing .env.example at the repo root');
    copyFileSync(ENV_EXAMPLE, ENV_PATH);
    ok('created .env from .env.example');
  } else {
    ok('.env already exists — keeping your values');
  }

  let content = readFileSync(ENV_PATH, 'utf8');
  const defaults = [
    ['APP_API_TOKEN', 'devtoken123'],
    ['PYTHON_BACKEND_URL', 'http://127.0.0.1:8000'],
    ['DATABASE_PATH', 'eneros.db'],
    // Generated last so its log line reads naturally.
    ['ENCRYPTION_KEY', () => generateEncryptionKey()],
  ];

  for (const [name, fallback] of defaults) {
    const value = typeof fallback === 'function' ? fallback() : fallback;
    const result = ensureValue(content, name, value);
    content = result.content;
    if (result.changed === 'filled') ok(`filled in ${name} in .env`);
    if (result.changed === 'added') ok(`added ${name} to .env`);
  }

  writeFileSync(ENV_PATH, content);

  const key = (content.match(/^[ \t]*ENCRYPTION_KEY[ \t]*=[ \t]*(.*)$/m) || [])[1]?.trim();
  if (key && key.length !== 44) {
    warn('ENCRYPTION_KEY in .env is not a 44-character Fernet key — the connector will fail to decrypt secrets.');
  }
}

function findPython() {
  const candidates = [];
  if (process.env.PYTHON_BIN) candidates.push(process.env.PYTHON_BIN.split(' '));
  candidates.push(['python'], ['py', '-3'], ['python3']);

  for (const candidate of candidates) {
    const [command, ...rest] = candidate;
    const probe = spawnSync(command, [...rest, '-c', 'import sys; print(sys.version.split()[0])'], {
      encoding: 'utf8',
      env: process.env,
    });
    const version = String(probe.stdout || '').trim();
    if (probe.status === 0 && /^3\.(1[0-9]|[2-9][0-9])/.test(version)) {
      return { command, args: rest, version };
    }
  }
  return null;
}

function setupPython() {
  log('Python connector (backend/)');

  const python = findPython();
  if (!python) {
    throw new Error(
      'Python 3.10+ was not found on PATH.\n' +
        '  Install it from https://www.python.org/downloads/windows/ (tick "Add python.exe to PATH"),\n' +
        '  then re-run `npm run setup`.',
    );
  }
  ok(`Python ${python.version} (${[python.command, ...python.args].join(' ')})`);

  const venvPython = process.platform === 'win32'
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');

  if (existsSync(venvPython)) {
    ok('backend/.venv already exists');
  } else {
    log('Creating backend/.venv');
    run(python.command, [...python.args, '-m', 'venv', '.venv'], BACKEND);
    ok('created backend/.venv');
  }

  log('Installing backend/requirements.txt');
  const pip = spawnSync(venvPython, ['-m', 'pip', '--version'], { encoding: 'utf8' });
  if (pip.status !== 0) {
    log('Bootstrapping pip in backend/.venv');
    run(venvPython, ['-m', 'ensurepip', '--upgrade']);
  }
  run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt'], BACKEND);
  ok('Python dependencies installed');
}

function main() {
  console.log('EnerOS setup — web :3000 · Node API :4000 · Python connector :8000');

  setupEnvFile();

  if (skipNode) {
    warn('skipping npm install (--skip-node)');
  } else {
    log('Installing root dependencies (Next.js app)');
    run(npm, ['install'], ROOT, { shell: process.platform === 'win32' });
    ok('root node_modules ready');

    log('Installing server dependencies (Node API)');
    run(npm, ['install'], SERVER, { shell: process.platform === 'win32' });
    ok('server/node_modules ready');
  }

  if (skipPython) {
    warn('skipping Python setup (--skip-python)');
  } else {
    setupPython();
  }

  console.log(`
✓ Setup complete.

Start everything in one terminal:

    npm run dev:all

Then, in a second PowerShell window, check the connector wiring:

    npm run verify:connector

Notes:
  • the first API start downloads an in-memory MongoDB binary once (a minute or two)
  • .env is gitignored — never commit it; edit .env.example for defaults
  • web http://localhost:3000   API http://localhost:4000   Python http://127.0.0.1:8000
`);
}

try {
  main();
} catch (error) {
  console.error(`\n✗ Setup failed: ${error.message}\n`);
  process.exit(1);
}
