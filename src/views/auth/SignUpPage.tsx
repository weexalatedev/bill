'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignUp } from '@clerk/clerk-react';
import { ClerkGate } from '../../components/auth/ClerkStates';
import AuthShell from './AuthShell';
import DevSignUpForm from '../../components/auth/DevSignUp';
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

  // Dev mode has no Clerk instance, so the API's own registration is used.
  if (config.authMode === 'dev') {
    return (
      <AuthShell
        title="Create your workspace"
        subtitle="Save the audit, then choose a plan. No card needed to create the account."
        footer={footer}
      >
        <DevSignUpForm onSuccess={() => router.replace('/onboarding/subscription')} />
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
          fallbackRedirectUrl="/onboarding/subscription"
          forceRedirectUrl="/onboarding/subscription"
        />
      </ClerkGate>
    </AuthShell>
  );
}
