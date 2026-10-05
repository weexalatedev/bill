import { Link } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { ClerkGate } from '../../components/auth/ClerkStates';
import AuthShell from './AuthShell';
import { clerkAppearance } from '../../lib/clerkAppearance';

/**
 * /sign-in — Clerk's hosted sign-in, embedded in the EnerOS shell.
 *
 * `routing="path"` + `path="/sign-in"` means Clerk renders at a real URL and
 * handles its own sub-routes (forgot-password, reset-password) underneath this
 * one, so React Router only needs a single entry here.
 */
export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your energy console."
      footer={
        <>
          New to EnerOS?{' '}
          <Link
            to="/sign-up"
            className="font-semibold text-emerald-700 transition-colors hover:text-emerald-800 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <ClerkGate>
        <SignIn
          path="/sign-in"
          routing="path"
          appearance={clerkAppearance}
          fallbackRedirectUrl="/welcome"
          signUpUrl="/sign-up"
          forceRedirectUrl="/welcome"
        />
      </ClerkGate>
    </AuthShell>
  );
}