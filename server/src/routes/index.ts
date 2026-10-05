import { Router } from 'express';
import { clerkEnabled, r2Enabled, env, llmEnabled } from '../env.js';
import { authRouter } from './auth.js';
import { workspaceRouter } from './workspace.js';
import { invoicesRouter } from './invoices.js';
import { actionsRouter } from './actions.js';
import { uploadsRouter } from './uploads.js';
import { analysisRouter } from './analysis.js';
import { accountRouter } from './account.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/workspace', workspaceRouter);
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/actions', actionsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/analysis', analysisRouter);
apiRouter.use('/account', accountRouter);

/**
 * Public bootstrap config. Lets the web and mobile apps discover the auth mode,
 * the Clerk publishable key and which optional features are live, so secrets and
 * keys only ever live in one place (the API).
 */
apiRouter.get('/config', (_req, res) => {
  res.json({
    authMode: clerkEnabled ? 'clerk' : 'dev',
    clerkPublishableKey: clerkEnabled ? env.clerkPublishableKey : null,
    r2Enabled,
    llmEnabled,
    demo: clerkEnabled ? { email: env.demo.email } : { email: env.demo.email, password: env.demo.password },
  });
});
