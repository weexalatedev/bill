'use client';
// Unified auth for the web app. When the API reports `authMode: 'clerk'` the
// app signs in with Clerk; otherwise it uses the dev-auth demo login. Either
// way the surface is the same (`useAuth()`), so the rest of the app is agnostic.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import { api, type ApiConfig } from './api';

export interface AuthUser {
  email: string;
  name: string;
}

export interface AuthValue {
  mode: 'clerk' | 'dev';
  config: ApiConfig;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  /** Bearer token attached to every API call. */
  getToken: () => Promise<string | null>;
  /** Dev-mode only — Clerk signs in through its own <SignIn/> component. */
  signInWithPassword?: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = 'eneros.dev.token';
const USER_KEY = 'eneros.dev.user';

// ── Dev-mode provider (used when Clerk is not configured) ──────────────────────
export function DevAuthProvider({
  config,
  children,
}: {
  config: ApiConfig;
  children: ReactNode;
}) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Verify any stored token on boot.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setIsLoaded(true);
      return;
    }
    api
      .getMe(stored)
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const result = await api.devLogin(email, password);
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const getToken = useCallback(() => Promise.resolve(token), [token]);

  const value = useMemo<AuthValue>(
    () => ({
      mode: 'dev',
      config,
      isLoaded,
      isSignedIn: Boolean(token),
      user,
      getToken,
      signInWithPassword,
      signOut,
    }),
    [config, isLoaded, token, user, getToken, signInWithPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Clerk provider (used when the API reports Clerk is configured) ─────────────
export function ClerkAuthProvider({
  config,
  children,
}: {
  config: ApiConfig;
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user } = useUser();

  const value = useMemo<AuthValue>(
    () => ({
      mode: 'clerk',
      config,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      user: user
        ? {
            email: user.primaryEmailAddress?.emailAddress ?? '',
            name: user.fullName ?? user.username ?? 'EnerOS user',
          }
        : null,
      getToken: () => getToken(),
      signOut: () => signOut(),
    }),
    [config, isLoaded, isSignedIn, user, getToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an auth provider');
  return ctx;
}
