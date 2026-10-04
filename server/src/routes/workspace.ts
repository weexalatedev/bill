import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { env } from '../env.js';
import { getWorkspace, setControlMode } from '../services/workspace.js';

export const workspaceRouter = Router();

/** Everything the clients need to hydrate their store, scoped to the caller. */
workspaceRouter.get('/', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const workspace = await getWorkspace(req.ownerId!, env.autoProvision);
    res.json({ workspace, user: { email: req.userEmail, name: req.userName } });
  } catch (error) {
    next(error);
  }
});

const modeSchema = z.object({ mode: z.enum(['Recommend', 'Approve', 'Automate']) });

workspaceRouter.put('/control-mode', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid control mode.' });
      return;
    }
    await setControlMode(req.ownerId!, parsed.data.mode);
    res.json({ controlMode: parsed.data.mode });
  } catch (error) {
    next(error);
  }
});
