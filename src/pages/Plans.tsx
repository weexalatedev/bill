import { useState } from 'react';
import { Calculator, Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, SectionHeading, StatCard } from '../components/ui';
import { gbp } from '../lib/format';

export default function Plans() {
  const { plans, account, sites, metrics, pushToast, refresh } = useApp();
  const { getToken } = useAuth();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const currentPlan = plans.find((p) => p.id === account.planId) ?? plans[0];
  const siteCount = sites.length;
  const monthlySub = siteCount * currentPlan.pricePerSite;
  const annualSub = monthlySub * 12;
  const annualSavings = Math.round(metrics.savings * 12);
  const flexibilityGross = 60000;
  const flexibilityShare = Math.round((flexibilityGross * account.flexibilitySharePct) / 100);

  const [verifiedSavings, setVerifiedSavings] = useState<number>(annualSavings);
  const performanceFee = Math.round((verifiedSavings * account.performanceFeePct) / 100);
  const totalEnerOSFee = annualSub + performanceFee + flexibilityShare;
  const customerRetains = verifiedSavings - performanceFee + flexibilityShare;

  const choosePlan = async (planId: string) => {
    setBusyPlan(planId);
    try {
      const token = (await getToken()) ?? '';
      const res = await api.billingCheckout(token, planId);
      if (res.mode === 'stripe' && res.url) {
        window.location.href = res.url;
        return;
      }
      pushToast('Plan activated — billing is running in demo mode.');
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={currentPlan.name}
          icon={<CreditCard className="h-5 w-5" />}
          tone="sky"
          sub={`${gbp(currentPlan.pricePerSite)}/site/month`}
        />
        <StatCard
          label="Subscription"
          value={`${gbp(monthlySub)}/mo`}
          icon={<CreditCard className="h-5 w-5" />}
          tone="violet"
          sub={`${siteCount} sites · ${gbp(annualSub)}/yr`}
        />
        <StatCard
          label="Performance fee"
          value={`${account.performanceFeePct}%`}
          icon={<Sparkles className="h-5 w-5" />}
          tone="amber"
          sub="only on verified savings"
        />
        <StatCard
          label="Flexibility share"
          value={`${account.flexibilitySharePct}%`}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="emerald"
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
                (plan.highlight ? 'ring-2 ring-emerald-500/30' : '')
              }
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white">
                  Most popular
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">{plan.tagline}</p>
                </div>
                {isCurrent && <Badge tone="emerald">Current</Badge>}
              </div>

              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-slate-900">
                  {gbp(plan.pricePerSite)}
                </span>
                <span className="text-sm text-slate-500">/site/month</span>
              </p>

              <ul className="mt-4 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isCurrent || busyPlan === plan.id}
                onClick={() => choosePlan(plan.id)}
                className={
                  'mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ' +
                  (isCurrent
                    ? 'cursor-default bg-slate-100 text-slate-400'
                    : 'bg-slate-900 text-white hover:bg-slate-800')
                }
              >
                {isCurrent ? 'Your current plan' : busyPlan === plan.id ? 'Starting…' : `Move to ${plan.name}`}
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
            action={<Calculator className="h-4 w-4 text-slate-400" />}
          />
          <label className="text-xs font-medium text-slate-500">
            Verified annual savings
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm font-semibold text-slate-400">£</span>
            <input
              type="number"
              value={verifiedSavings}
              onChange={(e) => setVerifiedSavings(Number(e.target.value) || 0)}
              className="w-full bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(400000, annualSavings * 2)}
            step={1000}
            value={verifiedSavings}
            onChange={(e) => setVerifiedSavings(Number(e.target.value))}
            className="mt-4 w-full accent-emerald-600"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>£0</span>
            <span>£{Math.round(Math.max(400000, annualSavings * 2) / 1000)}k</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-rose-50 p-3">
              <p className="text-xs font-medium text-rose-600">
                EnerOS fee ({account.performanceFeePct}%)
              </p>
              <p className="mt-1 text-xl font-bold text-rose-700">{gbp(performanceFee)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-600">You retain</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {gbp(verifiedSavings - performanceFee)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            That is {((1 - account.performanceFeePct / 100) * 100).toFixed(0)}% of verified savings
            kept by the customer — EnerOS earns more only when the customer saves more.
          </p>
        </Card>

        <Card>
          <SectionHeading
            title="Annual value summary"
            subtitle={`${account.name} · ${siteCount} sites on the ${currentPlan.name} plan.`}
          />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Subscription ({siteCount} × {gbp(currentPlan.pricePerSite)} × 12)</dt>
              <dd className="font-semibold text-slate-900">{gbp(annualSub)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Performance fee ({account.performanceFeePct}%)</dt>
              <dd className="font-semibold text-slate-900">{gbp(performanceFee)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">
                Flexibility revenue ({account.flexibilitySharePct}% share)
              </dt>
              <dd className="font-semibold text-slate-900">{gbp(flexibilityShare)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <dt className="font-semibold text-slate-700">Total EnerOS cost / year</dt>
              <dd className="text-lg font-bold text-slate-900">{gbp(totalEnerOSFee)}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-xl bg-ink-900 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              Customer outcome
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Verified savings of {gbp(verifiedSavings)} plus flexibility revenue of{' '}
              {gbp(flexibilityShare)}, net of fees.
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{gbp(customerRetains)}</p>
            <p className="text-xs text-slate-400">net annual benefit retained by the customer</p>
          </div>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-emerald-50 to-white">
        <SectionHeading
          title="Illustrative business case"
          subtitle="This is the shape of deal EnerOS is selling — a quantified outcome, not “AI software”."
          action={<Badge tone="emerald">35-site restaurant group</Badge>}
        />
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ['Annual energy spend', '£1,800,000'],
            ['Potential optimisation', '8%'],
            ['Potential annual saving', '£144,000'],
            ['EnerOS fee', '£25k–£40k'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          The customer retains most of the economic benefit — which is why the proposition is easy
          to sell. Give EnerOS your energy data, and it identifies what you are wasting, shows the
          financial impact, and automatically fixes the problems you approve.
        </p>
      </Card>
    </div>
  );
}