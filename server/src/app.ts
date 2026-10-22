import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { apiRouter } from './routes/index.js';
import { stripeWebhook } from './routes/billing.js';
import { clerkEnabled, r2Enabled, env, llmEnabled } from './env.js';
import { connectDb, isDbConnected } from './db.js';

export function createApp(): express.Express {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin / non-browser clients and any configured origin.
        if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) {
          callback(null, true);
          return;
        }
        callback(null, true); // permissive in dev; tighten for production
      },
      credentials: true,
    }),
  );

  // Stripe webhooks must be verified against the RAW body, so this route is
  // registered before the JSON parser. Every other route uses JSON below.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

  app.use(express.json({ limit: '2mb' }));

  // Clerk middleware is only attached when Clerk is configured; otherwise the
  // API runs in dev-auth mode and `requireUser` validates our own tokens.
  //
  // Both keys MUST be passed explicitly. `clerkMiddleware()` defaults to reading
  // the publishable key from each incoming request (header/query param), which
  // a browser never sends — so omitting it makes *every* route, including the
  // public ones, fail with "Publishable key is missing".
  if (clerkEnabled) {
    app.use(
      clerkMiddleware({
        secretKey: env.clerkSecretKey,
        publishableKey: env.clerkPublishableKey,
      }),
    );
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: isDbConnected(),
      auth: clerkEnabled ? 'clerk' : 'dev',
      storage: r2Enabled ? 'r2' : 'disabled',
      analysis: llmEnabled ? 'llm' : 'rules-only',
      live: 'octopus+carbon',
      time: new Date().toISOString(),
    });
  });

  app.use('/api', async (_req, _res, next) => {
    try {
      await connectDb();
      next();
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', apiRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[api] error:', message);
    res.status(500).json({ error: message });
  });

  return app;
}

const app = createApp();

export default app;
