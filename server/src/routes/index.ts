import { Router } from 'express';
import { r2Enabled, env } from '../env.js';
import { authRouter } from './auth.js';
import { workspaceRouter } from './workspace.js';
import { invoicesRouter } from './invoices.js';
import { actionsRouter } from './actions.js';
import { uploadsRouter } from './uploads.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/workspace', workspaceRouter);
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/actions', actionsRouter);
apiRouter.use('/uploads', uploadsRouter);

/**
 * Public bootstrap config. The Clerk publishable key is shared by both clients.
 */
apiRouter.get('/config', (_req, res) => {
  res.json({
    clerkPublishableKey: env.clerkPublishableKey,
    r2Enabled,
  });
});
