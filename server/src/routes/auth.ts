import { Router } from 'express';
import { z } from 'zod';
import {
  checkDemoCredentials,
  requireUser,
  resolveIdentity,
  signDevToken,
  type AuthedRequest,
} from '../auth.js';
import { clerkEnabled, r2Enabled, env } from '../env.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Dev-mode sign-in. Only available when Clerk is not configured — with Clerk,
 * clients authenticate directly against Clerk and the API trusts the session JWT.
 */
authRouter.post('/login', (req, res) => {
  if (clerkEnabled) {
    res.status(400).json({ error: 'Clerk is configured — sign in via Clerk instead.' });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const { email, password } = parsed.data;
  if (!checkDemoCredentials(email, password)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  res.json({
    token: signDevToken(email),
    user: { email: email.toLowerCase(), name: env.demo.name },
    mode: 'dev' as const,
  });
});

/** Returns the caller's identity, or 401 when signed out. */
authRouter.get('/me', (req, res) => {
  const identity = resolveIdentity(req as AuthedRequest);
  if (!identity) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ user: { email: identity.email, name: identity.name }, mode: identity.mode });
});

/** Stateless token — the client simply drops its token. Kept for symmetry. */
authRouter.post('/logout', requireUser, (_req, res) => {
  res.status(204).end();
});
