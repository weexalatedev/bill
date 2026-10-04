import { Router } from 'express';
import { clerkEnabled, r2Enabled, env } from '../env.js';
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
 * Public bootstrap config. Lets the web and mobile apps discover the auth mode
 * and Clerk publishable key from the server, so Clerk keys only live in one place.
 */
apiRouter.get('/config', (_req, res) => {
  res.json({
    authMode: clerkEnabled ? 'clerk' : 'dev',
    clerkPublishableKey: clerkEnabled ? env.clerkPublishableKey : null,
    r2Enabled,
    demo: clerkEnabled ? { email: env.demo.email } : { email: env.demo.email, password: env.demo.password },
  });
});
