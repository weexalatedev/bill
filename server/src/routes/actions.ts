import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { advanceAction, setActionStatus } from '../services/workspace.js';
import { ActionModel } from '../models/index.js';
import { checkControlSafety } from '../lib/autonomy/policy.js';

export const actionsRouter = Router();

const statusSchema = z.object({ status: z.enum(['Recommended', 'Approved', 'Automated']) });

/**
 * Safety gate: refuse to move a protected asset (refrigeration, freezers, alarms,
 * fire/life safety, security) into the Automated state. This is a hard API gate,
 * not a UI hint — see `server/src/lib/autonomy/policy.ts`.
 */
async function blockIfUnsafe(
  ownerId: string,
  id: string,
  target: string,
): Promise<{ status: 'ok' | 'blocked' | 'missing'; reason?: string }> {
  if (target !== 'Automated') return { status: 'ok' };
  const current = (await ActionModel.findOne({ ownerId, id }).lean().exec()) as
    | { asset?: string; title?: string; rationale?: string }
    | null;
  if (!current) return { status: 'missing' };
  const verdict = checkControlSafety(current);
  return verdict.allowed
    ? { status: 'ok' }
    : { status: 'blocked', reason: verdict.reason ?? 'Not permitted.' };
}

actionsRouter.patch('/:id', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    const gate = await blockIfUnsafe(req.ownerId!, req.params.id, parsed.data.status);
    if (gate.status === 'missing') {
      res.status(404).json({ error: 'Action not found.' });
      return;
    }
    if (gate.status === 'blocked') {
      res.status(422).json({ error: gate.reason, code: 'protected-asset' });
      return;
    }
    const action = await setActionStatus(req.ownerId!, req.params.id, parsed.data.status);
    if (!action) {
      res.status(404).json({ error: 'Action not found.' });
      return;
    }
    res.json({ action });
  } catch (error) {
    next(error);
  }
});

/** Progress an action Recommend → Approve → Automate, gated by the safety policy. */
actionsRouter.post('/:id/advance', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const current = (await ActionModel.findOne({ ownerId: req.ownerId, id: req.params.id })
      .lean()
      .exec()) as { status?: string } | null;
    if (!current) {
      res.status(404).json({ error: 'Action not found.' });
      return;
    }
    // Only the Approved → Automated step needs the safety gate.
    if (current.status === 'Approved') {
      const gate = await blockIfUnsafe(req.ownerId!, req.params.id, 'Automated');
      if (gate.status === 'blocked') {
        res.status(422).json({ error: gate.reason, code: 'protected-asset' });
        return;
      }
    }
    const action = await advanceAction(req.ownerId!, req.params.id);
    if (!action) {
      res.status(404).json({ error: 'Action not found.' });
      return;
    }
    res.json({ action });
  } catch (error) {
    next(error);
  }
});
