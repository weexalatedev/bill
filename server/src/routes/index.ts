import { Router } from 'express';
import { clerkEnabled, r2Enabled, env, llmEnabled, geminiEnabled, stripeEnabled } from '../env.js';
import { requireUser } from '../auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { authRouter } from './auth.js';
import { workspaceRouter } from './workspace.js';
import { invoicesRouter } from './invoices.js';
import { actionsRouter } from './actions.js';
import { uploadsRouter } from './uploads.js';
import { analysisRouter, priceCapHandler } from './analysis.js';
import { accountRouter } from './account.js';
import { liveRouter } from './live.js';
import { copilotRouter } from './copilot.js';
import { publicRouter } from './public.js';
import { billingRouter } from './billing.js';
import { plansRouter } from './plans.js';
import { subscriptionRouter } from './subscription.js';
import { consumptionRouter } from './consumption.js';
import { connectorRouter } from './connector.js';

export const apiRouter = Router();

// ── Public: no account, or account-only (no entitlement) ─────────────────────
apiRouter.use('/auth', authRouter);
apiRouter.use('/plans', plansRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/live', liveRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/subscription', subscriptionRouter);

// Published Ofgem data, needed by the public bill check and the auth screens
// before an account exists. Declared ahead of the guarded /analysis mount.
apiRouter.get('/analysis/price-cap', priceCapHandler);

// ── Product surface: requires an authenticated, paid-up workspace ────────────
//
// One guard, applied once, for every product route. Individual handlers no
// longer have to remember the check — and a new route added below is protected
// by default rather than by discipline.
apiRouter.use('/workspace', requireUser, requireActiveSubscription, workspaceRouter);
apiRouter.use('/invoices', requireUser, requireActiveSubscription, invoicesRouter);
apiRouter.use('/actions', requireUser, requireActiveSubscription, actionsRouter);
apiRouter.use('/uploads', requireUser, requireActiveSubscription, uploadsRouter);
apiRouter.use('/analysis', requireUser, requireActiveSubscription, analysisRouter);
apiRouter.use('/account', requireUser, requireActiveSubscription, accountRouter);
apiRouter.use('/consumption', requireUser, requireActiveSubscription, consumptionRouter);
apiRouter.use('/copilot', requireUser, requireActiveSubscription, copilotRouter);
apiRouter.use('/connector', requireUser, requireActiveSubscription, connectorRouter);

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
    /** Dev auth can create accounts here; with Clerk, Clerk owns registration. */
    registrationEnabled: !clerkEnabled,
    demo: clerkEnabled ? { email: env.demo.email } : { email: env.demo.email, password: env.demo.password },
  });
});
