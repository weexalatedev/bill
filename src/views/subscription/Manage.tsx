'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CreditCard, Loader2, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../store';
import { renewalLabel, useSubscription } from '../../lib/subscription';
import { Badge, Card, ProgressBar, SectionHeading, StatCard } from '../../components/ui';
import { gbp, gbp2 } from '../../lib/format';
import type { PaymentRecord } from '../../types';

const statusTone = (status: string) =>
  status === 'active' || status === 'cancelled' ? 'solid' : status === 'failed' || status === 'expired' ? 'outline' : 'muted';

/** `/subscription` — plan, capacity, payment history and plan changes. */
export default function ManageSubscription() {
  const { getToken } = useAuth();
  const { refresh: refreshWorkspace, pushToast } = useApp();
  const { subscription, loading, error, refresh } = useSubscription();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Business details: the same profile the onboarding flow captures, editable later.
  const [business, setBusiness] = useState({ companyName: '', postcode: '', regionId: '' });
  const [businessBusy, setBusinessBusy] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);

  const loadPayments = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const { payments: rows } = await api.getPayments(token);
      setPayments(rows);
      setPaymentsError(null);
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Could not load payment history.');
    }
  }, [getToken]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (businessLoaded) return;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const { profile } = await api.getProfile(token);
        setBusiness({
          companyName: profile.companyName,
          postcode: profile.postcode,
          regionId: profile.regionId,
        });
      } catch {
        // A missing profile is not an error: the fields simply start empty.
      } finally {
        setBusinessLoaded(true);
      }
    })();
  }, [businessLoaded, getToken]);

  const saveBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusinessBusy(true);
    setBusinessError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      await api.saveProfile(token, {
        companyName: business.companyName.trim(),
        siteCount: subscription?.sitesUsed ?? 1,
        postcode: business.postcode.trim(),
      });
      await refreshWorkspace();
      pushToast('Business details saved.');
    } catch (error) {
      setBusinessError(error instanceof ApiError ? error.message : 'Could not save those details.');
    } finally {
      setBusinessBusy(false);
    }
  };

  const run = async (action: 'cancel' | 'resume') => {
    setBusy(true);
    setActionError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      if (action === 'cancel') await api.cancelSubscription(token);
      else await api.resumeSubscription(token);
      await refresh();
      await loadPayments();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    setBusy(true);
    await Promise.all([refresh(), loadPayments()]);
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-neutral-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your subscription…
      </div>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <p className="text-sm font-semibold text-neutral-900">No subscription found</p>
        <p className="mt-1 text-xs text-neutral-600">{error ?? 'Choose a plan to get started.'}</p>
        <Link
          href="/onboarding/subscription"
          className="mt-4 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Choose a plan
        </Link>
      </Card>
    );
  }

  const capacityPct = Math.min(100, Math.round((subscription.sitesUsed / Math.max(1, subscription.siteLimit)) * 100));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current plan" value={subscription.planName} sub={`${gbp(subscription.pricePerSite)}/site/month`} icon={<CreditCard className="h-5 w-5" />} tone="muted" />
        <StatCard label="Monthly total" value={gbp2(subscription.monthlyGbp)} sub={`${subscription.sitesUsed} site${subscription.sitesUsed === 1 ? '' : 's'} billed`} />
        <StatCard label="Renews" value={renewalLabel(subscription.renewalDate)} sub={subscription.cancelAtPeriodEnd ? 'cancels at period end' : 'auto-renews'} />
        <StatCard label="Sites" value={`${subscription.sitesUsed} / ${subscription.siteLimit}`} sub={`${subscription.remainingSites} remaining`} />
      </div>

      <Card>
        <SectionHeading
          title="Subscription"
          subtitle="Plan, status and capacity, read from your live subscription record."
          action={<Badge tone={statusTone(subscription.status)}>{subscription.status.replace('_', ' ')}</Badge>}
        />

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral-600">Plan</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{subscription.planName}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-600">Billing period</dt>
            <dd className="mt-0.5 font-medium capitalize text-neutral-900">{subscription.billingPeriod}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-600">Period end</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{renewalLabel(subscription.currentPeriodEnd)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-600">Site capacity</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {subscription.sitesUsed} used · {subscription.remainingSites} remaining
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <ProgressBar value={capacityPct} />
          <p className="mt-1.5 text-xs text-neutral-600">
            {subscription.remainingSites === 0
              ? 'You have used every site in this plan. Upgrade to add more.'
              : `${subscription.remainingSites} site${subscription.remainingSites === 1 ? '' : 's'} left on this plan.`}
          </p>
        </div>

        {subscription.pendingChange && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A change to {subscription.pendingChange.planName} is staged but unpaid. Your current plan
            stays live until the payment is verified.
          </p>
        )}

        {actionError && (
          <p role="alert" className="mt-4 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {actionError}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/onboarding/subscription"
            className="eos-cta inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Change plan
          </Link>
          {subscription.cancelAtPeriodEnd ? (
            <button
              type="button"
              onClick={() => void run('resume')}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-neutral-50 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" /> Keep my subscription
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run('cancel')}
              disabled={busy || !subscription.isActive}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-neutral-50 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" /> Cancel at period end
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-neutral-50 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-neutral-600">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Cancelling never deletes sites, bills or history: the plan simply stops renewing and you
          keep access until {renewalLabel(subscription.currentPeriodEnd)}.
        </p>
      </Card>

      <Card>
        <SectionHeading
          title="Billing history"
          subtitle="Every attempt is recorded server-side: amount, provider and status."
        />
        {paymentsError && (
          <p className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">{paymentsError}</p>
        )}
        {payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-600">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs tracking-wide text-neutral-600">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Provider</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2.5 pr-4 text-neutral-600">
                      {new Date(payment.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2.5 pr-4 text-neutral-900">{payment.planName}</td>
                    <td className="max-w-[18rem] truncate py-2.5 pr-4 text-neutral-600">
                      {payment.description}
                    </td>
                    <td className="py-2.5 pr-4 capitalize text-neutral-600">
                      {payment.provider === 'dev' ? 'test mode' : payment.provider}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={payment.status === 'succeeded' ? 'solid' : payment.status === 'pending' ? 'muted' : 'outline'}>
                        {payment.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-neutral-900">
                      {gbp2(payment.amountGbp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeading
          title="Business details"
          subtitle="Shown on invoices and used to resolve your price-cap region. Editable at any time."
        />
        <form onSubmit={saveBusiness} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-3">Business name</span>
            <input
              value={business.companyName}
              onChange={(event) => setBusiness({ ...business, companyName: event.target.value })}
              required
              minLength={2}
              className="w-full rounded-[var(--radius-control)] border border-hairline bg-raised px-3 py-2 text-sm text-text-1 focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-3">Postcode</span>
            <input
              value={business.postcode}
              onChange={(event) => setBusiness({ ...business, postcode: event.target.value })}
              required
              pattern="[A-Za-z0-9 ]{4,10}"
              className="w-full rounded-[var(--radius-control)] border border-hairline bg-raised px-3 py-2 text-sm text-text-1 focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={businessBusy}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-[#9c4419] disabled:opacity-60"
          >
            {businessBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save details
          </button>
        </form>
        {businessError && (
          <p role="alert" className="mt-2 text-xs font-medium text-issue">
            {businessError}
          </p>
        )}
        <p className="mt-2 text-xs text-text-3">
          Changing the postcode re-resolves the Ofgem region used for the domestic reference; it does
          not move any sites.
        </p>
      </Card>

      <Card className="bg-neutral-50">
        <p className="text-sm font-semibold text-neutral-900">How plan changes work</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-neutral-600">
          <li>• Upgrades and downgrades both go through the same order summary and payment step.</li>
          <li>• Your current plan stays live until the new payment is verified — no gap in access.</li>
          <li>• Downgrading never deletes sites or history. If you are over the new cap you keep your data but cannot add sites until you are back within it.</li>
          <li>• Site caps and prices come from the server catalogue; this page never hardcodes them.</li>
        </ul>
      </Card>
    </div>
  );
}
