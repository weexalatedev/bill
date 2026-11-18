'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronUp, Loader2, Minus } from 'lucide-react';
import type { BillingPeriod, Plan } from '../../types';
import type { PlanDefinition } from '../../types';
import { cx } from '../../lib/cx';

/**
 * The plan cards. Every number comes from `/api/plans` (the server catalogue),
 * so the landing page, /pricing, onboarding and the console can never disagree.
 * `onSelect` turns the CTA into a client action (onboarding); without it the CTA
 * advances the funnel to the free bill check, keeping the order
 * landing → bill check → account → plan → payment.
 */
export default function PlansGrid({
  plans,
  billingPeriod = 'monthly',
  annualAvailable = false,
  recommendedId,
  currentPlanId,
  busyPlanId,
  onSelect,
  ctaLabel = 'Get started',
  ctaHref = '/start',
  footnote,
}: {
  plans: PlanDefinition[];
  billingPeriod?: BillingPeriod;
  annualAvailable?: boolean;
  recommendedId?: Plan['id'];
  currentPlanId?: Plan['id'];
  busyPlanId?: string | null;
  onSelect?: (planId: Plan['id'], billingPeriod: BillingPeriod) => void;
  ctaLabel?: string;
  ctaHref?: string;
  footnote?: string;
}) {
  const [period, setPeriod] = useState<BillingPeriod>(billingPeriod);
  const [showComparison, setShowComparison] = useState(false);

  const savingsPct = (plan: PlanDefinition): number => {
    if (typeof plan.annualSavingsPct === 'number') return plan.annualSavingsPct;
    const monthlyYearly = plan.pricePerSite * 12;
    if (!plan.annualPricePerSite || monthlyYearly <= 0) return 0;
    return Math.max(0, Math.round((1 - plan.annualPricePerSite / monthlyYearly) * 100));
  };

  const maxSaving = plans.reduce((max, plan) => Math.max(max, savingsPct(plan)), 0);
  const comparisonFeatures = Array.from(new Set(plans.flatMap((plan) => plan.features)));
  const comparisonRestrictions = Array.from(new Set(plans.flatMap((plan) => plan.restrictions)));

  return (
    <div>
      {annualAvailable && (
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1">
            <PeriodButton
              active={period === 'monthly'}
              label="Monthly"
              onClick={() => setPeriod('monthly')}
            />
            <PeriodButton
              active={period === 'annual'}
              label={maxSaving > 0 ? `Annual · save up to ${maxSaving}%` : 'Annual'}
              onClick={() => setPeriod('annual')}
            />
          </div>
        </div>
      )}

      {!annualAvailable && (
        <p className="mb-4 text-center text-xs text-neutral-600">
          Billed monthly, per site.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const recommended = plan.id === recommendedId;
          const current = plan.id === currentPlanId;
          const busy = busyPlanId === plan.id;
          const annual = period === 'annual' && annualAvailable;
          const price = annual ? plan.annualPricePerSite : plan.pricePerSite;
          const shownFeatures =
            plan.keyFeatures && plan.keyFeatures.length > 0 ? plan.keyFeatures : plan.features;
          const hiddenFeatureCount = Math.max(0, plan.features.length - shownFeatures.length);
          return (
            <div
              key={plan.id}
              className={cx(
                'flex flex-col rounded-xl border bg-white p-6 transition-shadow',
                recommended
                  ? 'border-ink-900/80 bg-raised shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_24px_60px_-32px_rgba(0,0,0,0.45)]'
                  : 'border-neutral-200',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-ink-900">{plan.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600">{plan.tagline}</p>
                </div>
                {recommended && (
                  <span className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold tracking-wide text-white">
                    Recommended
                  </span>
                )}
              </div>

              <div className="mt-5">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">£{price}</span>
                  <span className="text-xs text-neutral-600">/ site / {annual ? 'year' : 'month'}</span>
                </p>
                {annual ? (
                  <p className="mt-1.5 flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                      Save {savingsPct(plan)}%
                    </span>
                    <span className="text-neutral-500">compared to £{plan.pricePerSite}/mo billed monthly</span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-neutral-500">Billed monthly, cancel anytime.</p>
                )}
              </div>
              <p className="mt-3 text-xs text-neutral-600">
                Up to <span className="font-medium text-neutral-800">{plan.siteLimit} site{plan.siteLimit === 1 ? '' : 's'}</span> ·{' '}
                <span className="font-medium text-neutral-800">{plan.deviceLimit} devices</span>
              </p>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-neutral-700">
                {shownFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-900" strokeWidth={3} />
                    <span>{feature}</span>
                  </li>
                ))}
                {hiddenFeatureCount > 0 && (
                  <li className="pt-1 text-xs text-neutral-500">
                    + {hiddenFeatureCount} more feature{hiddenFeatureCount === 1 ? '' : 's'}
                  </li>
                )}
              </ul>

              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(plan.id, period)}
                  disabled={busy || current}
                  className={cx(
                    'mt-6 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
                    recommended
                      ? 'eos-cta text-white'
                      : 'border border-neutral-300 text-ink-900 hover:bg-neutral-50',
                    (busy || current) && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {current ? 'Current plan' : `${ctaLabel} ${plan.name}`}
                </button>
              ) : (
                <Link
                  href={`${ctaHref}${ctaHref.includes('?') ? '&' : '?'}plan=${plan.id}${
                    annual ? '&billing=annual' : ''
                  }`}
                  className={cx(
                    'mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
                    recommended
                      ? 'bg-ink-900 text-white hover:bg-[#9c4419]'
                      : 'border border-neutral-300 text-ink-900 hover:bg-neutral-50',
                  )}
                >
                  {ctaLabel} with {plan.name}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => setShowComparison((value) => !value)}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
        >
          {showComparison ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showComparison ? 'Hide full comparison' : 'View full comparison'}
        </button>
      </div>

      {showComparison && (
        <div className="mt-6">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-neutral-500">What you get</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="px-4 py-3">
                      <span className="block text-sm font-semibold text-neutral-900">{plan.name}</span>
                      <span className="block text-xs font-normal text-neutral-500">
                        £{period === 'annual' && annualAvailable ? plan.annualPricePerSite : plan.pricePerSite}
                        /site/{period === 'annual' && annualAvailable ? 'yr' : 'mo'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Sites included', ...plans.map((plan) => plan.siteLimit)],
                  ['Connected devices', ...plans.map((plan) => plan.deviceLimit)],
                ].map(([label, ...values]) => (
                  <tr key={String(label)} className="border-b border-neutral-100">
                    <td className="px-4 py-3 text-neutral-700">{String(label)}</td>
                    {values.map((value, index) => (
                      <td key={index} className="px-4 py-3 font-medium tabular-nums text-neutral-900">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
                {comparisonFeatures.map((feature) => (
                  <tr key={feature} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 text-neutral-700">{feature}</td>
                    {plans.map((plan) => (
                      <td key={plan.id} className="px-4 py-3">
                        {plan.features.includes(feature) ? (
                          <Check className="h-4 w-4 text-ink-900" strokeWidth={3} />
                        ) : (
                          <Minus className="h-4 w-4 text-neutral-300" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comparisonRestrictions.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-lg border border-neutral-100 p-4">
                  <p className="text-xs font-semibold text-neutral-700">{plan.name} limits</p>
                  <ul className="mt-2 space-y-1.5">
                    {plan.restrictions.map((restriction) => (
                      <li key={restriction} className="flex items-start gap-1.5 text-xs text-neutral-600">
                        <Minus className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400" />
                        <span>{restriction}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {footnote && <p className="mt-4 text-center text-xs text-neutral-600">{footnote}</p>}
    </div>
  );
}

function PeriodButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
        active ? 'bg-ink-900 text-white' : 'text-neutral-600 hover:text-neutral-900',
      )}
    >
      {label}
    </button>
  );
}
