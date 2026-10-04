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
  clerkPublishableKey: str(process.env.CLERK_PUBLISHABLE_KEY, ''),
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
};

/** Clerk is considered wired only when both keys are present. */
export const clerkEnabled = Boolean(env.clerkPublishableKey && env.clerkSecretKey);

/** Cloudflare R2 is considered wired only when the full credential set is present. */
export const r2Enabled = Boolean(
  env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket,
);
