'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Loader2, Lock, ShieldCheck, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSubscription } from '../../lib/subscription';
import FlowShell, { type FlowStep } from '../../components/flow/FlowShell';
import { Card } from '../../components/ui';
import { gbp, gbp2 } from '../../lib/format';

const RAIL: FlowStep[] = [
  { label: 'Choose a plan' },
  { label: 'Payment' },
  { label: 'Dashboard' },
];

/** `/onboarding/payment` — step 4: the charge, then verification. */
export default function PaymentStep() {
  const router = useRouter();
  const params = useSearchParams();
  const paymentId = params.get('payment');
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { subscription, loading, refresh } = useSubscription();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  /** Set once we are navigating to the success screen, so the redirect effect
   *  below cannot race it to /dashboard. */
  const settling = useRef(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  // Already paid (e.g. back button after success): go straight to the console.
  // Skipped while we are settling a payment, so the success screen wins.
  useEffect(() => {
    if (loading || settling.current) return;
    if (subscription?.isActive) router.replace('/dashboard');
  }, [loading, subscription, router]);

  const openPayment = useCallback(async () => {
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
      setError(err instanceof ApiError ? err.message : 'Could not start the payment.');
    }
  }, [getToken, router]);

  // Landing here without a payment id means the attempt was never created.
  useEffect(() => {
    if (loading || paymentId || started.current) return;
    started.current = true;
    void openPayment();
  }, [loading, paymentId, openPayment]);

  const pay = async () => {
    if (!paymentId) return;
    setBusy(true);
    setError(null);
    settling.current = true;
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const { subscription: next } = await api.confirmPayment(token, paymentId);
      router.replace(next.isActive ? '/onboarding/payment-status?state=success' : '/onboarding/payment-status');
      void refresh();
    } catch (err) {
      settling.current = false;
      setError(err instanceof ApiError ? err.message : 'The payment could not be completed.');
      setBusy(false);
    }
  };

  const abandon = async () => {
    if (paymentId) {
      const token = await getToken();
      if (token) await api.cancelPayment(token, paymentId).catch(() => undefined);
    }
    router.replace('/onboarding/subscription');
  };

  const payment = subscription?.latestPayment ?? null;
  const showing = payment && (!paymentId || payment.id === paymentId) ? payment : null;

  if (!isLoaded || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-50 text-sm text-neutral-600">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing your payment…
        </span>
      </div>
    );
  }

  return (
    <FlowShell
      steps={RAIL}
      current={1}
      eyebrow="Step 2 of 2"
      title="Complete your payment"
      subtitle="The subscription is activated by our server only after the payment is confirmed."
      onBack={() => router.push('/onboarding/subscription')}
      aside={
        <Link href="/sign-in" className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          Switch account
        </Link>
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-neutral-600">
                {showing ? showing.planName : subscription?.planName ?? 'Subscription'}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">
                {showing ? gbp2(showing.amountGbp) : subscription ? gbp2(subscription.monthlyGbp) : '—'}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {showing ? showing.description : 'Per site, per month · VAT included'}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-200 text-ink-900">
              <Wallet className="h-5 w-5" />
            </span>
          </div>

          <dl className="mt-5 space-y-2 border-t border-neutral-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">Sites billed</dt>
              <dd className="font-medium tabular-nums text-ink-900">
                {subscription?.sitesUsed || 1}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Billing period</dt>
              <dd className="font-medium text-ink-900">
                {showing?.billingPeriod === 'annual' ? 'Annual' : 'Monthly'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Reference</dt>
              <dd className="font-mono text-xs text-neutral-600">{showing?.id ?? paymentId ?? '—'}</dd>
            </div>
          </dl>
        </Card>

        {subscription?.devMode && (
          <Card className="bg-neutral-50">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <CreditCard className="h-4 w-4" /> Test mode
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              Stripe is not configured, so no card is charged. The confirmation still goes through
              the server: your subscription activates only when the API records the payment as
              succeeded.
            </p>
          </Card>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={pay}
          disabled={busy || !paymentId}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-[#9c4419] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {showing ? `Pay ${gbp2(showing.amountGbp)}` : 'Pay now'}
        </button>

        <div className="flex items-center justify-between text-xs text-neutral-600">
          <button type="button" onClick={abandon} className="hover:text-neutral-800 hover:underline">
            Cancel payment
          </button>
          <span>Nothing is activated until the payment is verified.</span>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-600">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          We never trust a browser “success” flag: the server checks the payment record before it
          changes your plan, and a failed or cancelled payment leaves your account locked.
        </p>
      </div>
    </FlowShell>
  );
}
