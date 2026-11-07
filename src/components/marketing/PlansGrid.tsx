'use client';
import Link from 'next/link';
import { Check, Loader2, Minus } from 'lucide-react';
import type { BillingPeriod, Plan, PlanDefinition } from '../../types';
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
  onSelect?: (planId: Plan['id']) => void;
  ctaLabel?: string;
  ctaHref?: string;
  footnote?: string;
}) {
  return (
    <div>
      {!annualAvailable && (
        <p className="mb-4 text-center text-xs text-neutral-500">
          Billed monthly, per site. Annual billing is not offered yet.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const recommended = plan.id === recommendedId;
          const current = plan.id === currentPlanId;
          const busy = busyPlanId === plan.id;
          return (
            <div
              key={plan.id}
              className={cx(
                'flex flex-col rounded-xl border bg-white p-6 transition-shadow',
                recommended
                  ? 'border-ink-900 shadow-[0_1px_0_rgba(0,0,0,0.06),0_12px_32px_-24px_rgba(0,0,0,0.5)]'
                  : 'border-neutral-200',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-ink-900">{plan.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{plan.tagline}</p>
                </div>
                {recommended && (
                  <span className="rounded-md bg-ink-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Recommended
                  </span>
                )}
              </div>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  £{plan.pricePerSite}
                </span>
                <span className="text-xs text-neutral-500">/ site / {billingPeriod === 'annual' ? 'year' : 'month'}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Billed for the sites you have · up to{' '}
                <span className="font-medium text-neutral-700">{plan.siteLimit} sites</span>
              </p>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-900" strokeWidth={3} />
                    <span>{feature}</span>
                  </li>
                ))}
                {plan.restrictions.map((restriction) => (
                  <li key={restriction} className="flex items-start gap-2 text-neutral-500">
                    <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={3} />
                    <span>{restriction}</span>
                  </li>
                ))}
              </ul>

              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(plan.id)}
                  disabled={busy || current}
                  className={cx(
                    'mt-6 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
                    recommended
                      ? 'bg-ink-900 text-white hover:bg-ink-800'
                      : 'border border-neutral-300 text-ink-900 hover:bg-neutral-50',
                    (busy || current) && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {current ? 'Current plan' : `${ctaLabel} ${plan.name}`}
                </button>
              ) : (
                <Link
                  href={`${ctaHref}${ctaHref.includes('?') ? '&' : '?'}plan=${plan.id}`}
                  className={cx(
                    'mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
                    recommended
                      ? 'bg-ink-900 text-white hover:bg-ink-800'
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

      {footnote && <p className="mt-4 text-center text-xs text-neutral-400">{footnote}</p>}
    </div>
  );
}
