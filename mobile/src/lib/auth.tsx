import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import { API_URL } from './api';

export interface AuthUser {
  email: string;
  name: string;
}

export interface AuthValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  getToken: () => Promise<string | null>;
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

export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user } = useUser();

  const value = useMemo<AuthValue>(
    () => ({
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
    [isLoaded, isSignedIn, user, getToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an auth provider');
  return ctx;
}

export { API_URL };
