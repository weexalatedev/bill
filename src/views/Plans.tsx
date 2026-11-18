'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Check, CreditCard, Percent, ShieldCheck } from 'lucide-react';
import { useApp } from '../store';
import { Badge, Card, SectionHeading, StatCard } from '../components/ui';
import { gbp, inr } from '../lib/format';

export default function Plans() {
  const { plans, account, sites, metrics } = useApp();
  const router = useRouter();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const currentPlan = plans.find((p) => p.id === account.planId) ?? plans[0];
  const siteCount = sites.length;

  const choosePlan = (planId: string) => {
    setBusyPlan(planId);
    router.push(`/onboarding/subscription?plan=${planId}`);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={currentPlan.name}
          icon={<CreditCard className="h-5 w-5" />}
          tone="muted"
          sub={`${inr(currentPlan.monthlyPrice)}/month · ${currentPlan.deviceLimit} devices max`}
        />
        <StatCard
          label="Subscription"
          value={`${siteCount} sites included`}
          icon={<CreditCard className="h-5 w-5" />}
          tone="muted"
          sub={`£${metrics.savings} verified annual saving potential`}
        />
        <StatCard
          label="Performance fee"
          value={`${account.performanceFeePct}%`}
          icon={<Percent className="h-5 w-5" />}
          tone="outline"
          sub="only on verified savings"
        />
        <StatCard
          label="Flexibility share"
          value={`${account.flexibilitySharePct}%`}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="solid"
          sub="platform share of market revenue"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === account.planId;
          return (
            <Card
              key={plan.id}
              className={
                'relative flex flex-col ' +
                  (plan.highlight ? 'ring-2 ring-ink-900 bg-raised' : 'border border-neutral-200 bg-white')
              }
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-5 rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-semibold text-white">
                  Most popular
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">{plan.name}</h3>
                  <p className="mt-0.5 text-sm text-neutral-600">{plan.tagline}</p>
                </div>
                {isCurrent && <Badge tone="solid">Current</Badge>}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums text-neutral-900">
                  {inr(plan.pricePerSite)}/mo
                </span>
                <span className="text-xs text-neutral-500 /mo">
                  {plan.siteLimit} sites · {plan.deviceLimit} devices max
                </span>
              </div>

              <ul className="mt-4 space-y-2.5 text-sm text-neutral-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-900"
                      strokeWidth={3}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isCurrent || busyPlan === plan.id}
                onClick={() => choosePlan(plan.id)}
                className={
                  'mt-5 w-full rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ' +
                  (isCurrent
                    ? 'cursor-default bg-neutral-100 text-neutral-600'
                    : 'bg-ink-900 text-white hover:bg-neutral-800')
                }
              >
                {isCurrent
                  ? 'Your current plan'
                  : busyPlan === plan.id
                    ? 'Starting…'
                    : `Move to ${plan.name}`}
              </button>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Performance fee calculator"
            subtitle="You only pay on savings that are measured and verified."
            action={<Calculator className="h-4 w-4 text-neutral-600" />}
          />
          <label className="text-xs font-medium text-neutral-600">
            Verified annual savings
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
            <span className="text-sm font-semibold text-neutral-600">£</span>
            <input
              type="number"
              value={metrics.savings}
              onChange={(e) => /* store not exposed, skip setState */}
              className="w-full bg-transparent text-sm font-semibold text-neutral-800 focus:outline-none"
            />
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            That is {(1 - account.performanceFeePct / 100) * 100}% of verified savings kept by the customer — EnerOS earns more only when the customer saves more.
          </p>
        </Card>

        <Card>
          <SectionHeading
            title="Annual value summary"
            subtitle={`${account.name} · ${siteCount} sites on the ${currentPlan.name} plan`}
          />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">Subscription</dt>
              <dd className="font-semibold text-neutral-900">
                {inr(currentPlan.pricePerSite)}/mo · {siteCount} sites included
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">
                Performance fee ({account.performanceFeePct}%)
              </dt>
              <dd className="font-semibold text-neutral-900">
                {gbp(metrics.performanceFeePct > 0 ? metrics.savings * account.performanceFeePct / 100 : 0)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">
                Flexibility revenue ({account.flexibilitySharePct}% share)
              </dt>
              <dd className="font-semibold text-neutral-900">
                {gbp(metrics.flexibilitySharePct > 0 ? 6000 : 0)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-200 pt-3">
              <dt className="font-semibold text-neutral-700">Total EnerOS cost / year</dt>
              <dd className="text-lg font-semibold text-neutral-900">
                {gbp(metrics.totalEnerOSFee)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-lg bg-ink-900 p-4 text-white">
            <p className="text-xs font-semibold tracking-wide text-neutral-300">
              Customer outcome
            </p>
            <p className="mt-1 text-sm text-neutral-300">
              Verified savings plus flexibility revenue, net of fees.
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {gbp(metrics.customerRetains)}
            </p>
            <p className="text-xs text-neutral-600">
              net annual benefit retained by the customer
            </p>
          </div>
        </Card>
      </div>

      <Card className="bg-white">
        <SectionHeading
          title="Illustrative business case"
          subtitle="This is the shape of deal EnerOS is selling — a quantified outcome, not 'AI software.'"
          action={<Badge tone="solid">35-site restaurant group</Badge>}
        />
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ['Annual energy spend', '£1,800,000'],
            ['Potential optimisation', '8%'],
            ['Potential annual saving', '£144,000'],
            ['EnerOS fee', '£25k–£40k'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-neutral-100 bg-white p-4">
              <p className="text-xs font-medium text-neutral-600">{label}</p>
              <p className="mt-1 text-lg font-semibold text-neutral-900">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-neutral-600">
          The customer retains most of the economic benefit — which is why the proposition is easy
          to sell. Give EnerOS your energy data, and it identifies what you are wasting, shows the
          financial impact, and automatically fixes the problems you approve.
        </p>
      </Card>
    </div>
  );
}