'use client';
import Link from 'next/link';
import { SignUp } from '@clerk/clerk-react';
import { ClerkGate } from '../../components/auth/ClerkStates';
import AuthShell from './AuthShell';
import { clerkAppearance } from '../../lib/clerkAppearance';

/**
 * /sign-up — Clerk's hosted sign-up, embedded in the EnerOS shell.
 *
 * Clerk owns email verification (`/sign-up/verify-email/:code`), so the
 * redirect target is always `/welcome`: a brand-new Clerk user has no workspace
 * yet, while a returning user is bounced straight through to the console.
 */
export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Free while you audit your first three bills. No card required."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-semibold text-emerald-700 transition-colors hover:text-emerald-800 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <ClerkGate>
        <SignUp
          path="/sign-up"
          routing="path"
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          fallbackRedirectUrl="/welcome"
          forceRedirectUrl="/welcome"
        />
      </ClerkGate>
    </AuthShell>
  );
}