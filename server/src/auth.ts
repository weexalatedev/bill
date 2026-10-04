import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';

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
}

export const ownerIdFromClerkUser = (userId: string): string => `clerk:${userId}`;

/** Express middleware that resolves the caller's Clerk identity. */
export function requireUser(req: AuthedRequest, res: Response, next: NextFunction): void {
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
    [claims.first_name, claims.last_name].filter((value) => typeof value === 'string').join(' ').trim() ||
    email ||
    'EnerOS user';
  req.ownerId = ownerIdFromClerkUser(userId);
  req.userEmail = email;
  req.userName = name;
  next();
}

/** Resolve identity for the `/api/auth/me` endpoint without failing when signed out. */
export function resolveIdentity(req: AuthedRequest): Identity | null {
  const auth = getAuth(req);
  const userId = auth?.userId ?? null;
  if (!userId) return null;
  const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
  const email =
    (typeof claims.email === 'string' && claims.email) ||
    (typeof claims.email_address === 'string' && claims.email_address) ||
    '';
  const name =
    (typeof claims.name === 'string' && claims.name) ||
    [claims.first_name, claims.last_name].filter((value) => typeof value === 'string').join(' ').trim() ||
    email ||
    'EnerOS user';
  return { ownerId: ownerIdFromClerkUser(userId), email, name };
}
