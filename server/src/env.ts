import 'dotenv/config';

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
  port: Number(str(process.env.PORT, '4000')),
  mongoUri: str(process.env.MONGODB_URI, 'mongodb://127.0.0.1:27017/eneros'),
  mongoDb: process.env.MONGODB_DB?.trim() || undefined,
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
    /** Anthropic API key — enables bill text → structured extraction. */
    anthropicApiKey: str(process.env.ANTHROPIC_API_KEY, ''),
    anthropicModel: str(process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-5'),
    /** Elexon Insights API. Public and key-less, but allow-listable. */
    elexonBaseUrl: str(
      process.env.ELEXON_BASE_URL,
      'https://api.elexon.co.uk/insights/api',
    ),
    /** Network timeout for outbound reference-data calls. */
    upstreamTimeoutMs: Number(str(process.env.UPSTREAM_TIMEOUT_MS, '6000')),
  },
};

export function assertClerkConfigured(): void {
  if (!env.clerkPublishableKey || !env.clerkSecretKey) {
    throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required; dev auth is disabled.');
  }
}

/** Clerk is considered wired only when both keys are present. */
export const clerkEnabled = Boolean(env.clerkPublishableKey && env.clerkSecretKey);

/** Cloudflare R2 is considered wired only when the full credential set is present. */
export const r2Enabled = Boolean(
  env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket,
);

/** LLM-assisted bill extraction is optional; the rules engine never depends on it. */
export const llmEnabled = Boolean(env.analysis.anthropicApiKey);
