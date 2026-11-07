'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Zap } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { destinationFor, useSubscription } from '../../lib/subscription';

/**
 * `/auth/continue` — one resolver for “where does this account go?”.
 *
 * Used after sign-in (dev and Clerk) so the access table lives in exactly one
 * place: active → dashboard, pending → plans, payment in flight → status,
 * expired → renewal. Sign-up deliberately bypasses it and goes straight to the
 * plan picker, because a new account has no entitlement to resolve.
 */
export default function ContinuePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { subscription, loading } = useSubscription();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    if (loading) return;
    router.replace(destinationFor(subscription));
  }, [isLoaded, isSignedIn, loading, subscription, router]);

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50">
      <div className="flex flex-col items-center gap-3 text-neutral-500">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-ink-900">
          <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Taking you to the right place…
        </p>
      </div>
    </div>
  );
}
