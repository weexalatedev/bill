import { Router } from 'express';
import { z } from 'zod';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  checkDemoCredentials,
  requireUser,
  resolveIdentity,
  signDevToken,
  type AuthedRequest,
} from '../auth.js';
import { clerkEnabled, env } from '../env.js';
import { DevUserModel } from '../models/index.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** scrypt hash in `salt:hash` form — dev auth only, never used with Clerk. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Dev-mode sign-up. Clerk owns registration when it is configured; without it
 * the API keeps a small user table so the full journey — register, choose a
 * plan, pay, reach the dashboard — is exercisable locally and in tests.
 */
authRouter.post('/register', async (req, res, next) => {
  try {
    if (clerkEnabled) {
      res.status(400).json({ error: 'Clerk is configured — sign up through Clerk instead.' });
      return;
    }
    const parsed = z
      .object({
        email: z.string().trim().email('Enter a valid email address.'),
        password: z.string().min(8, 'Use at least 8 characters.'),
        name: z.string().trim().max(120).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid details.' });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    if (email === env.demo.email) {
      res.status(409).json({ error: 'That email is already registered. Sign in instead.' });
      return;
    }
    const existing = await DevUserModel.findOne({ email }).lean().exec();
    if (existing) {
      res.status(409).json({ error: 'That email is already registered. Sign in instead.' });
      return;
    }
    const name = parsed.data.name?.trim() || email.split('@')[0];
    await DevUserModel.create({
      email,
      name,
      passwordHash: hashPassword(parsed.data.password),
    });
    res.status(201).json({
      token: signDevToken(email),
      user: { email, name },
      mode: 'dev' as const,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Dev-mode sign-in. Only available when Clerk is not configured — with Clerk,
 * clients authenticate directly against Clerk and the API trusts the session JWT.
 */
authRouter.post('/login', async (req, res, next) => {
  try {
    if (clerkEnabled) {
      res.status(400).json({ error: 'Clerk is configured — sign in via Clerk instead.' });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const { password } = parsed.data;

    if (checkDemoCredentials(email, password)) {
      res.json({
        token: signDevToken(email),
        user: { email, name: env.demo.name },
        mode: 'dev' as const,
      });
      return;
    }

    const user = await DevUserModel.findOne({ email }).lean().exec();
    if (!user || !verifyPassword(password, String(user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    res.json({
      token: signDevToken(email),
      user: { email, name: user.name ?? email },
      mode: 'dev' as const,
    });
  } catch (error) {
    next(error);
  }
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
