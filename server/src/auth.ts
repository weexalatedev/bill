import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { clerkEnabled, env } from './env.js';

/** Express request augmented with the resolved owner + identity. */
export interface AuthedRequest extends Request {
  ownerId?: string;
  userEmail?: string;
  userName?: string;
}

export interface Identity {
  ownerId: string;
  email: string;
  name: string;
  mode: 'clerk' | 'dev';
}

export const ownerIdFromEmail = (email: string): string => `user:${email.toLowerCase()}`;
export const ownerIdFromClerkUser = (userId: string): string => `clerk:${userId}`;

// ── Dev-mode tokens (only used when Clerk is not configured) ───────────────────
const sign = (payload: string): string =>
  crypto.createHmac('sha256', env.devAuthSecret).update(payload).digest('base64url');

/** Issue a bearer token for the dev-auth mode. */
export function signDevToken(email: string): string {
  const body = Buffer.from(email.toLowerCase()).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Validate a dev-auth bearer token, returning the email it was issued for. */
export function verifyDevToken(token: string): string | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return Buffer.from(body, 'base64url').toString('utf8');
}

/** Validate demo credentials against the configured demo account. */
export function checkDemoCredentials(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === env.demo.email &&
    password === env.demo.password
  );
}

/**
 * Express middleware that resolves the caller's identity.
 * Clerk mode: verifies the Clerk session token. Dev mode: verifies our own token.
 */
export function requireUser(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (clerkEnabled) {
    const auth = getAuth(req);
    const userId = auth?.userId ?? null;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
    const email =
      (typeof claims.email === 'string' && claims.email) ||
      (typeof claims.email_address === 'string' && claims.email_address) ||
      '';
    const name =
      (typeof claims.name === 'string' && claims.name) ||
      [claims.first_name, claims.last_name].filter((v) => typeof v === 'string').join(' ').trim() ||
      email ||
      'EnerOS user';
    req.ownerId = ownerIdFromClerkUser(userId);
    req.userEmail = email;
    req.userName = name;
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const email = token ? verifyDevToken(token) : null;
  if (!email) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.ownerId = ownerIdFromEmail(email);
  req.userEmail = email;
  req.userName = env.demo.name;
  next();
}

/** Resolve identity for the `/api/auth/me` endpoint without failing when signed out. */
export function resolveIdentity(req: AuthedRequest): Identity | null {
  if (clerkEnabled) {
    const auth = getAuth(req);
    const userId = auth?.userId ?? null;
    if (!userId) return null;
    const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
    const email = typeof claims.email === 'string' ? claims.email : '';
    return {
      ownerId: ownerIdFromClerkUser(userId),
      email,
      name: typeof claims.name === 'string' ? claims.name : email || 'EnerOS user',
      mode: 'clerk',
    };
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const email = token ? verifyDevToken(token) : null;
  if (!email) return null;
  return { ownerId: ownerIdFromEmail(email), email, name: env.demo.name, mode: 'dev' };
}
