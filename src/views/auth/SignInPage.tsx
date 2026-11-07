'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignIn } from '@clerk/clerk-react';
import { ClerkGate } from '../../components/auth/ClerkStates';
import AuthShell from './AuthShell';
import DevSignInForm from '../../components/auth/DevSignIn';
import { useAuth } from '../../lib/auth';
import { clerkAppearance } from '../../lib/clerkAppearance';

/**
 * /sign-in — reached from inside the acquisition flow ("create an account to save
 * money"), not as the front door. Clerk handles its own sub-routes
 * (forgot-password, reset-password) underneath this URL.
 *
 * `routing="path"` + `path="/sign-in"` means Clerk renders at a real URL and
 * handles those sub-routes itself, so the app only needs this one entry.
 */
export default function SignInPage() {
  const { config } = useAuth();
  const router = useRouter();

  const footer = (
    <>
      New to EnerOS?{' '}
      <Link
        href="/sign-up"
        className="font-semibold text-neutral-700 transition-colors hover:text-neutral-800 hover:underline"
      >
        Create an account
      </Link>
    </>
  );

  // Dev mode has no Clerk instance, so the demo login is rendered in its place.
  if (config.authMode === 'dev') {
    return (
      <AuthShell
        title="Welcome back"
        subtitle="Demo mode — sign in with the demo account to open your console."
        footer={footer}
      >
        <DevSignInForm onSuccess={() => router.replace('/auth/continue')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your energy console."
      footer={footer}
    >
      <ClerkGate>
        <SignIn
          path="/sign-in"
          routing="path"
          appearance={clerkAppearance}
          fallbackRedirectUrl="/auth/continue"
          signUpUrl="/sign-up"
          forceRedirectUrl="/onboarding"
        />
      </ClerkGate>
    </AuthShell>
  );
}
