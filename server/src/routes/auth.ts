import { Router } from 'express';
import { resolveIdentity, type AuthedRequest } from '../auth.js';

export const authRouter = Router();

/** Returns the caller's identity, or 401 when signed out. */
authRouter.get('/me', (req, res) => {
  const identity = resolveIdentity(req as AuthedRequest);
  if (!identity) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ user: { email: identity.email, name: identity.name } });
});
