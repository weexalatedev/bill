'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignUp } from '@clerk/clerk-react';
import { ClerkGate } from '../../components/auth/ClerkStates';
import AuthShell from './AuthShell';
import DevSignInForm from '../../components/auth/DevSignIn';
import { useAuth } from '../../lib/auth';
import { clerkAppearance } from '../../lib/clerkAppearance';

/**
 * /sign-up — reached from the acquisition flow's "create an account to save
 * money" step. Clerk owns email verification
 * (`/sign-up/verify-email/:code`), so the redirect target is always
 * `/onboarding`, which itself bounces an already-onboarded account to the console.
 */
export default function SignUpPage() {
  const { config } = useAuth();
  const router = useRouter();

  const footer = (
    <>
      Already have an account?{' '}
      <Link
        href="/sign-in"
        className="font-semibold text-neutral-700 transition-colors hover:text-neutral-800 hover:underline"
      >
        Sign in
      </Link>
    </>
  );

  // Dev mode has no Clerk instance, so the demo login stands in for sign-up.
  if (config.authMode === 'dev') {
    return (
      <AuthShell
        title="Create your workspace"
        subtitle="Demo mode — Clerk is not configured, so sign in with the demo account instead."
        footer={footer}
      >
        <DevSignInForm onSuccess={() => router.replace('/onboarding')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Free while you audit your first three bills. No card required."
      footer={footer}
    >
      <ClerkGate>
        <SignUp
          path="/sign-up"
          routing="path"
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          fallbackRedirectUrl="/onboarding"
          forceRedirectUrl="/onboarding"
        />
      </ClerkGate>
    </AuthShell>
  );
}
