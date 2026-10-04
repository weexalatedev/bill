import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { apiRouter } from './routes/index.js';
import { assertClerkConfigured, r2Enabled, env } from './env.js';
import { connectDb, isDbConnected } from './db.js';

export function createApp(): express.Express {
  assertClerkConfigured();
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

  app.use(express.json({ limit: '2mb' }));

  app.use(clerkMiddleware());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: isDbConnected(),
      auth: 'clerk',
      storage: r2Enabled ? 'r2' : 'disabled',
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
