'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSubscription } from '../../lib/subscription';
import FlowShell, { type FlowStep } from '../../components/flow/FlowShell';
import PlansGrid from '../../components/marketing/PlansGrid';
import { Card } from '../../components/ui';
import { gbp, gbp2 } from '../../lib/format';
import type { BillingPeriod, OrderSummary, PlansResponse, Plan } from '../../types';

const RAIL: FlowStep[] = [
  { label: 'Choose a plan' },
  { label: 'Payment' },
  { label: 'Dashboard' },
];

/** `/onboarding/subscription` — step 3 of the funnel, after the account exists. */
export default function SubscriptionStep() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { subscription, loading, refresh } = useSubscription();

  const [catalogue, setCatalogue] = useState<PlansResponse | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    api
      .getPlans()
      .then(setCatalogue)
      .catch((err: unknown) =>
        setCatalogueError(err instanceof Error ? err.message : 'Could not load the plans.'),
      );
  }, []);

  const choosePlan = async (planId: Plan['id']) => {
    setError(null);
    setBusyPlan(planId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const result = await api.selectPlan(token, planId, billingPeriod);
      setOrder(result.order);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'We could not stage that plan. Please try again.',
      );
    } finally {
      setBusyPlan(null);
    }
  };

  const goToPayment = async () => {
    setPaying(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const checkout = await api.startCheckout(token, {
        ...(order ? { planId: order.planId } : {}),
        billingPeriod,
      });
      if (checkout.mode === 'stripe' && checkout.url) {
        window.location.href = checkout.url;
        return;
      }
      router.push(checkout.url ?? `/onboarding/payment?payment=${checkout.payment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment.');
      setPaying(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-50 text-sm text-neutral-600">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your account…
        </span>
      </div>
    );
  }

  if (order) {
    return (
      <FlowShell
        steps={RAIL}
        current={1}
        eyebrow="Order summary"
        title="Review your subscription"
        subtitle="Nothing is charged and nothing is activated until you complete the payment on the next screen."
        onBack={() => {
          setOrder(null);
          setError(null);
        }}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Plan</p>
                <p className="mt-1 text-lg font-semibold text-ink-900">{order.planName}</p>
                <p className="text-xs text-neutral-600">
                  {order.sites} site{order.sites > 1 ? 's' : ''} × £{order.pricePerSite}/site/{order.billingPeriod === 'annual' ? 'year' : 'month'}
                </p>
              </div>
              <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600">
                    {order.billingPeriod === 'annual' ? 'Annual' : 'Monthly'}
              </span>
            </div>

            <dl className="mt-5 space-y-2 border-t border-neutral-200 pt-4 text-sm">
              {order.lines.map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-neutral-600">{line.label}</dt>
                  <dd className="font-medium tabular-nums text-ink-900">{gbp2(line.amount)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-3">
                <dt className="font-semibold text-ink-900">Total due today</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink-900">{gbp2(order.total)}</dd>
              </div>
            </dl>
          </Card>

          {error && (
            <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={goToPayment}
            disabled={paying}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-3 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Continue to payment
          </button>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your dashboard unlocks only after the payment provider confirms the charge to our
            server. Closing the checkout leaves your account exactly as it is.
          </p>
        </div>
      </FlowShell>
    );
  }

  return (
    <FlowShell
      steps={RAIL}
      current={0}
      eyebrow="Step 1 of 2"
      title="Choose your plan"
      subtitle="Priced per site, per month. Your dashboard opens as soon as the payment is verified."
      aside={
        <Link href="/sign-in" className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          Switch account
        </Link>
      }
    >
      <div className="space-y-5">
        {subscription?.status === 'expired' && (
          <Card className="bg-neutral-50">
            <p className="text-sm font-semibold text-neutral-900">Your subscription has expired</p>
            <p className="mt-1 text-xs text-neutral-600">
              Your sites and history are safe. Choose a plan below to restore access — nothing is
              deleted while you are lapsed.
            </p>
          </Card>
        )}

        {subscription?.isActive && (
          <Card className="bg-neutral-50">
            <p className="text-sm font-semibold text-neutral-900">
              You are on {subscription.planName}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Choosing a different plan stages a change. Your current plan stays live until the new
              payment is verified.
            </p>
            <Link
              href="/dashboard"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:underline"
            >
              Back to dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        )}

        {catalogue && catalogue.annualBillingAvailable && (
          <div className="flex justify-center gap-2">
            {(['monthly', 'annual'] as BillingPeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setBillingPeriod(period)}
                className={
                  billingPeriod === period
                    ? 'rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700'
                }
              >
                {period === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        )}

        {catalogueError && (
          <Card>
            <p className="text-sm font-semibold text-neutral-900">Plans could not be loaded</p>
            <p className="mt-1 text-xs text-neutral-600">{catalogueError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold"
            >
              Try again
            </button>
          </Card>
        )}

        {!catalogue && !catalogueError && (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-neutral-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
          </div>
        )}

        {catalogue && (
          <PlansGrid
            plans={catalogue.plans}
            billingPeriod={billingPeriod}
            annualAvailable={catalogue.annualBillingAvailable}
            recommendedId={catalogue.recommendedPlanId}
            currentPlanId={subscription?.isActive ? subscription.planId : undefined}
            busyPlanId={busyPlan}
            onSelect={choosePlan}
            ctaLabel="Choose"
            footnote={
              catalogue.siteLimitSource === 'provisional'
                ? 'Site caps per plan are provisional; the price is per site, per month, as defined in the README.'
                : undefined
            }
          />
        )}

        {error && (
          <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {error}
          </p>
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-neutral-600">
          <ArrowLeft className="h-3.5 w-3.5" />
          <Link href="/dashboard" className="hover:underline">
            You can add sites after subscribing
          </Link>
          <span aria-hidden>·</span>
          <Link href="/start" className="hover:underline">
            Check another bill
          </Link>
        </p>

        {subscription && (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-600">
            <Check className="h-3 w-3" /> Status: {subscription.status.replace('_', ' ')} ·{' '}
            {subscription.sitesUsed}/{subscription.siteLimit} sites used
          </p>
        )}
      </div>
    </FlowShell>
  );
}
