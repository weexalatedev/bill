'use client';
/**
 * Subscription state for the browser.
 *
 * One hook, one endpoint (`/api/subscription/status`), one routing decision —
 * so the console gate, the dashboard card, the plans picker and the billing page
 * can never disagree about whether a customer is paid up. The server is still
 * the authority: these helpers only decide where to *navigate*, never what to
 * allow.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import type { SubscriptionView } from '../types';

export interface SubscriptionState {
  subscription: SubscriptionView | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<SubscriptionView | null>;
}

export function useSubscription(): SubscriptionState {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<SubscriptionView | null> => {
    const token = await getToken();
    if (!token) {
      setSubscription(null);
      setLoading(false);
      return null;
    }
    try {
      const { subscription: next } = await api.getSubscription(token);
      setSubscription(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read your subscription.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  return useMemo(
    () => ({ subscription, loading, error, refresh }),
    [subscription, loading, error, refresh],
  );
}

/**
 * Default navigation for a subscription state. Mirrors the access table:
 * unauthenticated → landing; registered/no plan → plans; pending payment →
 * payment status; failed → retry; active → dashboard; expired → renewal.
 */
export function destinationFor(subscription: SubscriptionView | null): string {
  if (!subscription) return '/onboarding/subscription';
  switch (subscription.status) {
    case 'active':
      return '/dashboard';
    case 'cancelled':
      // Still paid until period end, so the dashboard is correct; the banner in
      // the console explains the cancellation.
      return subscription.isActive ? '/dashboard' : '/onboarding/subscription?renew=1';
    case 'payment_pending':
      return '/onboarding/payment-status';
    case 'failed':
      return '/onboarding/payment-status?state=failed';
    case 'expired':
      return '/onboarding/subscription?renew=1';
    case 'pending':
    default:
      return '/onboarding/subscription';
  }
}

/** `Feb 2027` style date for renewal copy. */
export function renewalLabel(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
