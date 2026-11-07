'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { renewalLabel, useSubscription } from '../../lib/subscription';
import FlowShell, { type FlowStep } from '../../components/flow/FlowShell';
import { Card } from '../../components/ui';
import { gbp, gbp2 } from '../../lib/format';

const RAIL: FlowStep[] = [
  { label: 'Choose a plan' },
  { label: 'Payment' },
  { label: 'Dashboard' },
];

/** `/onboarding/payment-status` — where Stripe returns, and where failures land. */
export default function PaymentStatus() {
  const router = useRouter();
  const params = useSearchParams();
  const paymentId = params.get('payment');
  const state = params.get('state');
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { subscription, loading, refresh } = useSubscription();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  const payment = useMemo(() => {
    const latest = subscription?.latestPayment ?? null;
    if (!latest) return null;
    if (!paymentId || latest.id === paymentId) return latest;
    return latest;
  }, [subscription, paymentId]);

  const outcome: 'success' | 'failed' | 'cancelled' | 'pending' | 'unknown' = subscription?.isActive
    ? 'success'
    : state === 'cancelled' || payment?.status === 'cancelled'
      ? 'cancelled'
      : payment?.status === 'failed'
        ? 'failed'
        : payment?.status === 'pending'
          ? 'pending'
          : 'unknown';

  // Stripe's redirect can arrive before its webhook. Poll briefly for the truth.
  useEffect(() => {
    if (outcome !== 'pending' || loading) return;
    if (waited >= 20) return;
    const timer = window.setTimeout(() => {
      setWaited((value) => value + 1);
      void refresh();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [outcome, loading, waited, refresh]);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const checkout = await api.startCheckout(token, {});
      if (checkout.mode === 'stripe' && checkout.url) {
        window.location.href = checkout.url;
        return;
      }
      router.replace(`/onboarding/payment?payment=${checkout.payment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not restart the payment.');
      setRetrying(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-50 text-sm text-neutral-600">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your payment…
        </span>
      </div>
    );
  }

  const copy = {
    success: {
      icon: CheckCircle2,
      eyebrow: 'Payment verified',
      title: 'Your subscription is active',
      body: 'The payment was confirmed server-side. Your dashboard is ready — add your first site when you are.',
    },
    failed: {
      icon: AlertTriangle,
      eyebrow: 'Payment failed',
      title: 'That payment did not go through',
      body: 'No access has been granted and nothing has been charged. Try again with the same or a different plan.',
    },
    cancelled: {
      icon: Clock,
      eyebrow: 'Payment cancelled',
      title: 'No payment was taken',
      body: 'Your account is unchanged. You can pick a plan again whenever you are ready.',
    },
    pending: {
      icon: Loader2,
      eyebrow: 'Waiting for confirmation',
      title: 'Confirming your payment',
      body: 'The payment provider has not confirmed the charge to our server yet. This page updates itself — no need to refresh.',
    },
    unknown: {
      icon: Clock,
      eyebrow: 'Nothing to show yet',
      title: 'No payment to confirm',
      body: 'Start by choosing a plan. Nothing is charged until you complete the payment step.',
    },
  }[outcome];

  const Icon = copy.icon;

  return (
    <FlowShell steps={RAIL} current={outcome === 'success' ? 2 : 1} eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.body}>
      <div className="space-y-4">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-neutral-200 text-ink-900">
              <Icon className={outcome === 'pending' ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">
                {subscription?.isActive ? subscription.planName : payment?.planName ?? 'Subscription'}
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">
                {payment ? `${gbp2(payment.amountGbp)} · ${payment.description}` : 'No payment recorded yet'}
              </p>
              {subscription?.isActive && (
                <p className="mt-2 text-xs text-neutral-600">
                  Renews {renewalLabel(subscription.renewalDate)} ·{' '}
                  {subscription.sitesUsed}/{subscription.siteLimit} sites used
                </p>
              )}
              {payment?.failureReason && (
                <p className="mt-2 text-xs text-neutral-600">Reason: {payment.failureReason}</p>
              )}
            </div>
          </div>
        </Card>

        {error && (
          <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {outcome === 'success' && (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Open your dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {(outcome === 'failed' || outcome === 'cancelled' || outcome === 'unknown') && (
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
            >
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Retry payment
            </button>
          )}
          {outcome === 'pending' && waited >= 20 && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-ink-900"
            >
              <RotateCcw className="h-4 w-4" /> Start a new payment
            </button>
          )}
          <Link
            href="/onboarding/subscription"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-neutral-50"
          >
            {outcome === 'success' ? 'Manage plan' : 'Choose a plan'}
          </Link>
        </div>

        {outcome === 'pending' && (
          <p className="text-xs text-neutral-600">
            Still checking… if the provider has already taken the payment, the webhook will settle
            it and this page will switch to active automatically.
          </p>
        )}
      </div>
    </FlowShell>
  );
}
