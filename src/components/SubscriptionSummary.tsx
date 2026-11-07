'use client';
import Link from 'next/link';
import { ArrowRight, Building2, CreditCard } from 'lucide-react';
import { Badge, Card, ProgressBar } from './ui';
import { gbp } from '../lib/format';
import { renewalLabel, useSubscription } from '../lib/subscription';

/**
 * The console's plan card. Every figure is read from the live subscription
 * record — sites used is a real count of this workspace's site documents, never
 * a hardcoded number.
 */
export default function SubscriptionSummary() {
  const { subscription, loading } = useSubscription();
  if (loading || !subscription) return null;

  const pct = Math.min(100, Math.round((subscription.sitesUsed / Math.max(1, subscription.siteLimit)) * 100));
  const atCap = subscription.remainingSites === 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 text-ink-900">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {subscription.planName} · {gbp(subscription.monthlyGbp)}/month
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {subscription.billingPeriod} · renews {renewalLabel(subscription.renewalDate)}
              {subscription.cancelAtPeriodEnd ? ' · cancelling at period end' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={subscription.isActive ? 'solid' : 'outline'}>
            {subscription.status.replace('_', ' ')}
          </Badge>
          <Link
            href="/subscription"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-900 hover:underline"
          >
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-neutral-400" />
        <p className="text-xs font-medium text-neutral-700">
          Sites used: {subscription.sitesUsed} / {subscription.siteLimit}{' '}
          <span className="font-normal text-neutral-500">
            {atCap ? 'no capacity left' : `${subscription.remainingSites} remaining`}
          </span>
        </p>
      </div>
      <div className="mt-2">
        <ProgressBar value={pct} />
      </div>

      {atCap && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2.5">
          <p className="text-xs text-neutral-700">
            You have reached the maximum number of sites allowed in your current subscription.
          </p>
          <Link
            href="/onboarding/subscription"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-800"
          >
            Upgrade plan <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </Card>
  );
}
