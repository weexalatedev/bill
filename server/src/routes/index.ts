import { Router } from 'express';
import { clerkEnabled, r2Enabled, env, llmEnabled, geminiEnabled, stripeEnabled } from '../env.js';
import { authRouter } from './auth.js';
import { workspaceRouter } from './workspace.js';
import { invoicesRouter } from './invoices.js';
import { actionsRouter } from './actions.js';
import { uploadsRouter } from './uploads.js';
import { analysisRouter } from './analysis.js';
import { accountRouter } from './account.js';
import { liveRouter } from './live.js';
import { copilotRouter } from './copilot.js';
import { publicRouter } from './public.js';
import { billingRouter } from './billing.js';
import { consumptionRouter } from './consumption.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/workspace', workspaceRouter);
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/actions', actionsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/analysis', analysisRouter);
apiRouter.use('/account', accountRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/consumption', consumptionRouter);
apiRouter.use('/live', liveRouter);
apiRouter.use('/copilot', copilotRouter);

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
    liveEnabled: true,
    geminiEnabled,
    stripeEnabled,
    demo: clerkEnabled ? { email: env.demo.email } : { email: env.demo.email, password: env.demo.password },
  });
});
