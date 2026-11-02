import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// One `.env` at the repo root is the single source of truth shared with the
// Next.js app and the Python connector (see the root `.env.example`), so
// APP_API_TOKEN can never drift between the API and the connector.
// `server/.env` is still honoured as a fallback for API-only runs, and a real
// environment variable (Vercel, Docker, CI) always wins because dotenv never
// overwrites an already-set variable.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../.env') });
loadEnv({ path: resolve(here, '../.env') });
loadEnv();

const str = (value: string | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value.trim() : fallback;

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value.trim());

const list = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const env = {
  get port(): number { return Number(str(process.env.PORT, '4000')); },
  get mongoUri(): string { return str(process.env.MONGODB_URI, 'mongodb://127.0.0.1:27017/eneros'); },
  get mongoDb(): string | undefined { return process.env.MONGODB_DB?.trim() || undefined; },
  /**
   * Clerk publishable key. Two names are accepted because the canonical Clerk
   * variable in Next.js docs is `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` while the
   * Vite/Express convention is `CLERK_PUBLISHABLE_KEY`. Reading only one of them
   * silently disabled Clerk in production, so both are honoured.
   */
  clerkPublishableKey: str(
    process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    '',
  ),
  clerkSecretKey: str(process.env.CLERK_SECRET_KEY, ''),
  r2: {
    accountId: str(process.env.R2_ACCOUNT_ID, ''),
    accessKeyId: str(process.env.R2_ACCESS_KEY_ID, ''),
    secretAccessKey: str(process.env.R2_SECRET_ACCESS_KEY, ''),
    bucket: str(process.env.R2_BUCKET, ''),
    publicBaseUrl: str(process.env.R2_PUBLIC_BASE_URL, ''),
  },
  corsOrigins: list(
    str(
      process.env.CORS_ORIGINS,
      'http://localhost:5173,http://localhost:8081,http://localhost:19006',
    ),
  ),
  demo: {
    email: str(process.env.DEMO_EMAIL, 'demo@eneros.app').toLowerCase(),
    password: str(process.env.DEMO_PASSWORD, 'EnerOS-demo-2026'),
    name: str(process.env.DEMO_NAME, 'Demo Operator'),
    org: str(process.env.DEMO_ORG, 'Harbour Hospitality Group'),
  },
  devAuthSecret: str(process.env.DEV_AUTH_SECRET, 'eneros-dev-secret'),
  autoProvision: bool(process.env.AUTO_PROVISION, true),

  /**
   * Smart Analysis — optional enrichment layers. Everything here degrades
   * gracefully: with no keys the deterministic engine still runs, it simply
   * cannot narrate bills with an LLM or enrich with half-hourly weather.
   */
  analysis: {
    /**
     * Gemini API key — enables bill text → structured extraction AND grounded
     * chat for the Copilot. One key switches both on.
     */
    geminiApiKey: str(process.env.GEMINI_API_KEY, ''),
    /**
     * Optional model pin. Empty (the default) means "no default model": the
     * server asks the API which models this key can use (ListModels) and picks
     * the cheapest one available — see `resolveGeminiModel` in lib/llm.ts.
     */
    geminiModel: str(process.env.GEMINI_MODEL, ''),
    /** Gemini API base — overridable so the Copilot can be tested with a stub. */
    geminiBaseUrl: str(process.env.GEMINI_BASE_URL, 'https://generativelanguage.googleapis.com/v1beta'),
    /** Elexon Insights API. Public and key-less, but allow-listable. */
    elexonBaseUrl: str(
      process.env.ELEXON_BASE_URL,
      'https://api.elexon.co.uk/insights/api',
    ),
    /** Network timeout for outbound reference-data calls. */
    upstreamTimeoutMs: Number(str(process.env.UPSTREAM_TIMEOUT_MS, '6000')),
  },

  /**
   * Live UK energy data — real-time, key-less public feeds.
   *
   * The "real-time" layer pulls actual GB market data rather than a seeded
   * snapshot:
   *   • Octopus Energy public tariff API → the half-hourly Agile Octopus unit
   *     rate for the customer's own distribution region (A–P, which map 1:1 to
   *     Ofgem's 14 cap regions). No API key, no account.
   *   • NESO Carbon Intensity API → the current and forecast gCO2/kWh for GB.
   * Every provider degrades gracefully: with no network the app still runs on
   * the deterministic engine, it simply reports the live layer as unavailable.
   */
  live: {
    /** Octopus Energy public API root. */
    octopusBaseUrl: str(process.env.OCTOPUS_BASE_URL, 'https://api.octopus.energy/v1'),
    /** Agile product code. Latest published at time of writing. */
    agileProduct: str(process.env.AGILE_PRODUCT, 'AGILE-24-10-01'),
    /** Agile Outgoing (export) product — sets the live export credit rate. */
    agileExportProduct: str(process.env.AGILE_EXPORT_PRODUCT, 'AGILE-OUTGOING-19-05-13'),
    /** Default distribution region letter (A–P) when a site has no postcode. */
    agileRegion: str(process.env.AGILE_REGION, 'C'),
    /** NESO Carbon Intensity API root. */
    carbonBaseUrl: str(process.env.CARBON_BASE_URL, 'https://api.carbonintensity.org.uk'),
    /** Per-request upstream timeout (ms). */
    timeoutMs: Number(str(process.env.LIVE_TIMEOUT_MS, '7000')),
    /** How long a fetched price curve is reused before re-fetching (ms). */
    cacheTtlMs: Number(str(process.env.LIVE_CACHE_TTL_MS, '900000')),
  },

  /**
   * Stripe subscription billing. Optional: with no secret key the API runs in a
   * clearly-labelled dev mode that activates a plan without taking payment, so
   * the product is demoable end to end. With a key, checkout is real and the
   * webhook is signature-verified.
   */
  stripe: {
    secretKey: str(process.env.STRIPE_SECRET_KEY, ''),
    webhookSecret: str(process.env.STRIPE_WEBHOOK_SECRET, ''),
    /** Base URL used to build success/cancel redirects. */
    appBaseUrl: str(process.env.APP_BASE_URL, 'http://localhost:5173'),
  },
};

export function assertClerkConfigured(): void {
  if (!env.clerkPublishableKey || !env.clerkSecretKey) {
    throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required; dev auth is disabled.');
  }
}

/** Clerk is considered wired only when both keys are present. */
export const clerkEnabled = Boolean(env.clerkPublishableKey && env.clerkSecretKey);

export const geminiEnabled = Boolean(env.analysis.geminiApiKey);
export const stripeEnabled = Boolean(env.stripe.secretKey);
/** Optional pin; empty = auto-select the cheapest model the API offers. */
export const geminiModel: string = str(process.env.GEMINI_MODEL, '');
/** Bill extraction is Gemini-powered; kept as the health-check / config flag. */
export const llmEnabled = geminiEnabled;

/** Cloudflare R2 is considered wired only when the full credential set is present. */
export const r2Enabled = Boolean(
  env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket,
);

/** LLM-assisted bill extraction is optional; the rules engine never depends on it. */

/** Python connector backend (FastAPI) — proxied server-to-server. */
export const pythonBackend = {
  /** Base URL of the running FastAPI connector service (default port 8000). */
  baseUrl: str(process.env.PYTHON_BACKEND_URL, 'http://127.0.0.1:8000'),
  /** Bearer token the Python backend requires on every call (APP_API_TOKEN). */
  appApiToken: str(process.env.APP_API_TOKEN, ''),
};
