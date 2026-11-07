import { Router } from 'express';
import {
  ANNUAL_BILLING_AVAILABLE,
  BILLING_PERIODS,
  PLAN_CATALOG,
  RECOMMENDED_PLAN_ID,
  SITE_LIMIT_PROVENANCE,
  planById,
  purchasablePlans,
} from '../services/plans.js';

export const plansRouter = Router();

/**
 * The public plan catalogue. This is the only place plans are described, so the
 * landing page, the pricing page, the onboarding picker and the console all show
 * exactly the same numbers.
 *
 * Anything the README does not define is reported as *unavailable* rather than
 * guessed: no annual price, and site caps flagged as provisional.
 */
plansRouter.get('/', (_req, res) => {
  res.json({
    plans: purchasablePlans(),
    allPlans: PLAN_CATALOG,
    billingPeriods: BILLING_PERIODS,
    annualBillingAvailable: ANNUAL_BILLING_AVAILABLE,
    recommendedPlanId: RECOMMENDED_PLAN_ID,
    currency: 'GBP',
    priceBasis: 'per site, per month',
    vatRatePct: 20,
    siteLimitSource: SITE_LIMIT_PROVENANCE,
    notes: {
      annualPricing:
        'The README prices EnerOS per site per month and defines no annual price, so annual billing is disabled rather than invented.',
      siteLimits:
        'The README prices per site but does not set a cap per plan. Site caps are provisional and live in server/src/services/plans.ts.',
    },
  });
});

plansRouter.get('/:id', (req, res) => {
  const plan = PLAN_CATALOG.find((candidate) => candidate.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Unknown plan.' });
    return;
  }
  res.json({ plan: planById(plan.id) });
});
