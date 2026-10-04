import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { advanceAction, setActionStatus } from '../services/workspace.js';

export const actionsRouter = Router();

const statusSchema = z.object({ status: z.enum(['Recommended', 'Approved', 'Automated']) });

actionsRouter.patch('/:id', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status.' });
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

/** Progress an action Recommend → Approve → Automate. */
actionsRouter.post('/:id/advance', requireUser, async (req: AuthedRequest, res, next) => {
  try {
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
