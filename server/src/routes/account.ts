import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { AccountModel } from '../models/index.js';
import { regionForPostcode } from '../lib/priceCap.js';

export const accountRouter = Router();

/**
 * Onboarding profile, captured on the welcome screen right after sign-up.
 *
 * This is the minimum needed to make every later analysis concrete: a business
 * name, how many sites to price, and a postcode — which resolves the Ofgem cap
 * region all rate benchmarks are drawn against.
 */
const profileSchema = z.object({
  companyName: z.string().min(2).max(120),
  siteCount: z.number().int().min(1).max(500),
  postcode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 ]{4,10}$/, 'Enter a valid UK postcode.'),
  /** Optional: pick the cap region manually when the postcode guess is wrong. */
  regionId: z.string().optional(),
});

accountRouter.get('/profile', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const account = await AccountModel.findOne({ ownerId: req.ownerId }).lean().exec();
    res.json({
      profile: {
        companyName: account?.name ?? '',
        siteCount: account?.sites ?? 0,
        postcode: account?.postcode ?? '',
        regionId: account?.region ?? '',
        onboarded: Boolean(account?.postcode),
      },
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.put('/profile', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile.' });
      return;
    }
    const { companyName, siteCount, postcode, regionId } = parsed.data;
    // An explicit region always wins; otherwise estimate from the postcode.
    const region = regionId ?? regionForPostcode(postcode)?.id ?? '';

    await AccountModel.updateOne(
      { ownerId: req.ownerId },
      {
        $set: {
          name: companyName,
          sites: siteCount,
          postcode: postcode.toUpperCase(),
          region,
          onboarded: true,
        },
      },
      { upsert: true },
    ).exec();

    res.json({
      profile: {
        companyName,
        siteCount,
        postcode: postcode.toUpperCase(),
        regionId: region,
        onboarded: true,
      },
    });
  } catch (error) {
    next(error);
  }
});