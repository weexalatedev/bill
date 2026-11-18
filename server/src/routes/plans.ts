import { Router } from 'express';
import {
  ANNUAL_BILLING_AVAILABLE,
  BILLING_PERIODS,
  PLAN_CATALOG,
  RECOMMENDED_PLAN_ID,
  SITE_LIMIT_PROVENANCE,
  annualSavingsPct,
  planById,
  purchasablePlans,
} from '../services/plans.js';

export const plansRouter = Router();

/**
 * The public plan catalogue. This is the only place plans are described, so the
 * landing page, the pricing page, the onboarding picker and the console all show
 * exactly the same numbers. Each plan carries its monthly and annual per-site
 * price plus the whole-percentage annual saving.
 */
plansRouter.get('/', (_req, res) => {
  const withSavings = purchasablePlans().map((plan) => ({
    ...plan,
    annualSavingsPct: annualSavingsPct(plan),
  }));
  res.json({
    plans: withSavings,
    allPlans: PLAN_CATALOG.map((plan) => ({
      ...plan,
      annualSavingsPct: annualSavingsPct(plan),
    })),
    billingPeriods: BILLING_PERIODS,
    annualBillingAvailable: ANNUAL_BILLING_AVAILABLE,
    recommendedPlanId: RECOMMENDED_PLAN_ID,
    currency: 'GBP',
    priceBasis: 'per site, billed monthly or annually',
    vatRatePct: 20,
    siteLimitSource: SITE_LIMIT_PROVENANCE,
    notes: {
      annualPricing:
        'Annual billing is an average of about 12% off the monthly price across plans; the exact saving per plan is exposed as annualSavingsPct.',
      siteLimits:
        'The founder prices per site and does not set a cap per plan. Site caps are provisional and live in server/src/services/plans.ts.',
    },
  });
});

plansRouter.get('/:id', (req, res) => {
  const plan = PLAN_CATALOG.find((candidate) => candidate.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Unknown plan.' });
    return;
  }
  res.json({ plan: { ...planById(plan.id), annualSavingsPct: annualSavingsPct(plan) } });
});
