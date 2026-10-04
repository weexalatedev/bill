import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';

export interface AuthUser {
  email: string;
  name: string;
}

export interface AuthValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  /** Bearer token attached to every API call. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

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
