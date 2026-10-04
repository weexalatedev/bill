// Unified auth for the mobile app, mirroring the web app. When the API reports
// `authMode: 'clerk'` the app signs in with Clerk; otherwise the dev-auth demo
// login is used. Same credentials as the web app → same workspace.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import { api, API_URL, type ApiConfig } from './api';

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
  getToken: () => Promise<string | null>;
  signInWithPassword?: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// SecureStore is native-only; fall back to in-memory storage on web/unsupported.
const memory = new Map<string, string>();
const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return (await SecureStore.getItemAsync(key)) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    memory.set(key, value);
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* ignore — memory fallback already holds the value */
    }
  },
  async remove(key: string): Promise<void> {
    memory.delete(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};

/** Token cache for Clerk's secure session storage. */
export const clerkTokenCache = {
  async getToken(key: string): Promise<string | null> {
    return storage.get(key);
  },
  async saveToken(key: string, value: string): Promise<void> {
    await storage.set(key, value);
  },
};

const TOKEN_KEY = 'eneros.dev.token';
const USER_KEY = 'eneros.dev.user';

// ── Dev-mode provider ─────────────────────────────────────────────────────────
export function DevAuthProvider({ config, children }: { config: ApiConfig; children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await storage.get(TOKEN_KEY);
      if (!stored) {
        setIsLoaded(true);
        return;
      }
      try {
        const data = await api.getMe(stored);
        setToken(stored);
        setUser(data.user);
      } catch {
        await storage.remove(TOKEN_KEY);
        await storage.remove(USER_KEY);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const result = await api.devLogin(email, password);
    await storage.set(TOKEN_KEY, result.token);
    await storage.set(USER_KEY, JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await storage.remove(TOKEN_KEY);
    await storage.remove(USER_KEY);
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

// ── Clerk provider ────────────────────────────────────────────────────────────
export function ClerkAuthProvider({ config, children }: { config: ApiConfig; children: ReactNode }) {
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

export { API_URL };
