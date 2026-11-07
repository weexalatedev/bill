'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { destinationFor, useSubscription } from '../lib/subscription';
import { useApp } from '../store';

/**
 * The console gate: authentication **and** entitlement, in that order.
 *
 *   signed out                → /sign-in
 *   registered, no plan       → /onboarding/subscription
 *   payment in flight         → /onboarding/payment-status
 *   payment failed            → /onboarding/payment-status (retry)
 *   expired                   → /onboarding/subscription?renew=1
 *   active                    → the console
 *
 * It only decides *where to send* the browser. Every API route repeats the same
 * check server-side, so hiding a page is never the protection.
 */
export default function SubscriptionGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { subscription, loading } = useSubscription();
  const { error: workspaceError, refresh: refreshWorkspace } = useApp();
  const router = useRouter();
  const rehydrated = useRef(false);

  // The workspace is fetched as soon as the provider mounts — which, for a new
  // account, is *before* the plan is paid. That request returns 402 and the store
  // remembers the error; once the subscription is active we retry it exactly once.
  useEffect(() => {
    if (!subscription?.isActive || rehydrated.current) return;
    if (!workspaceError) return;
    rehydrated.current = true;
    void refreshWorkspace();
  }, [subscription, workspaceError, refreshWorkspace]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    if (loading) return;
    if (!subscription?.isActive) {
      router.replace(destinationFor(subscription));
    }
  }, [isLoaded, isSignedIn, loading, subscription, router]);

  if (isLoaded && isSignedIn && !loading && subscription?.isActive) {
    return <>{children}</>;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50">
      <div className="flex flex-col items-center gap-3 text-neutral-600">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-ink-900">
          <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your subscription…
        </p>
      </div>
    </div>
  );
}
