'use client';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Database, Gauge, PauseCircle, PlayCircle } from 'lucide-react';
import { useApp } from '../../store';
import { Badge, Card } from '../ui';
import EvidenceMark, { Money } from '../EvidenceMark';
import { gbp } from '../../lib/format';
import type { DashboardTab } from './DashboardTabs';

/**
 * The plan, in one strip.
 *
 * The business plan says the only number that matters is **verified £ saved per
 * site per year**, and that everything else is a step toward it. So this strip
 * leads with the three stages of that money — identified, awaiting approval,
 * automated — plus the data coverage that makes any of it believable, and the
 * trust ladder with its kill switch.
 */
export default function PlanPulse({ onOpenTab }: { onOpenTab: (tab: DashboardTab) => void }) {
  const { actions, invoices, sites, metrics, controlMode, setControlMode, pushToast } = useApp();

  const awaiting = actions
    .filter((action) => action.status === 'Recommended')
    .reduce((total, action) => total + action.monthlySaving, 0);
  const automated = actions
    .filter((action) => action.status === 'Automated')
    .reduce((total, action) => total + action.monthlySaving, 0);
  const identified = awaiting + metrics.committedSaving + metrics.issuesValue;

  const withData = sites.filter((site) => site.dataQuality?.consumption === 'hh').length;
  const coverage =
    sites.length === 0
      ? 0
      : Math.round(
          sites.reduce((total, site) => total + (site.dataQuality?.coveragePct ?? 0), 0) / sites.length,
        );

  const paused = controlMode === 'Recommend';

  const setMode = async (mode: 'Recommend' | 'Approve' | 'Automate') => {
    await setControlMode(mode);
    pushToast(
      mode === 'Recommend'
        ? 'Automation paused — EnerOS will only recommend.'
        : mode === 'Automate'
          ? 'Automate enabled — approved classes run within policy limits.'
          : 'Approve enabled — one click per action before anything runs.',
    );
  };

  return (
    <Card className="bg-gradient-to-b from-neutral-50 to-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
            Verified £ saved per site per year
          </p>
          <p className="mt-1 flex items-baseline gap-2 text-3xl font-semibold tracking-tight text-ink-900">
            {gbp(metrics.savings)}
            <EvidenceMark
              state="verified"
              evidence={{
                inputs: [
                  `Baseline spend ${gbp(metrics.spendExpected)}`,
                  `Actual spend ${gbp(metrics.spendActual)}`,
                  `${sites.length} site${sites.length === 1 ? '' : 's'}, ${invoices.length} audited invoice${invoices.length === 1 ? '' : 's'}`,
                ],
                arithmetic: 'Expected spend − actual spend, summed across the trailing baseline.',
                source: 'Your own invoices and the pre-optimisation baseline held per site.',
              }}
            />
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Baseline vs actual across {sites.length} site{sites.length === 1 ? '' : 's'} ·{' '}
            {metrics.savingsRate.toFixed(1)}% below the pre-optimisation baseline
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-700">
            <Money
              value={`${gbp(awaiting + metrics.issuesValue)}`}
              state="estimated"
              className="font-semibold text-ink-900"
              evidence={{
                inputs: [
                  `${actions.filter((a) => a.status === 'Recommended').length} recommended opportunities`,
                  `${invoices.filter((i) => i.status === 'Flagged').length} open bill findings`,
                ],
                arithmetic: "Sum of each opportunity's modelled £/mo plus the impacts of open findings.",
                source: 'Deterministic rules on your data; not yet executed or recovered.',
              }}
            />
            <span className="text-neutral-600">estimated, not yet realised</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={paused ? 'outline' : 'solid'}>
            {paused ? 'Recommending only' : `Autonomy: ${controlMode}`}
          </Badge>
          <button
            type="button"
            onClick={() => void setMode(paused ? 'Approve' : 'Recommend')}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-neutral-50"
          >
            {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
            {paused ? 'Resume automation' : 'Pause automation'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Identified',
            value: identified,
            hint: `${invoices.filter((invoice) => invoice.status === 'Flagged').length} bill issues + ${actions.length} opportunities`,
            icon: Gauge,
            tab: 'savings' as DashboardTab,
          },
          {
            label: 'Awaiting your approval',
            value: awaiting,
            hint: 'per month, from recommended actions',
            icon: BadgeCheck,
            tab: 'savings' as DashboardTab,
          },
          {
            label: 'Automated',
            value: automated,
            hint: 'per month, running within policy',
            icon: PlayCircle,
            tab: 'savings' as DashboardTab,
          },
        ].map(({ label, value, hint, icon: Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => onOpenTab(tab)}
            className="group rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
              <Icon className="h-3.5 w-3.5" /> {label}
            </span>
            <span className="mt-0.5 block text-lg font-semibold tabular-nums text-ink-900">
              {gbp(value)}
              <span className="ml-1 text-xs font-normal text-neutral-600">/mo</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-neutral-600">{hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50/70 px-3 py-2">
        <p className="flex items-center gap-2 text-xs text-neutral-700">
          <Database className="h-3.5 w-3.5" />
          <span className="font-semibold text-ink-900">Data confidence {coverage}%</span>
          <span className="text-neutral-600">
            · {withData}/{sites.length} sites on half-hourly
          </span>
        </p>
        <Link
          href="/data"
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-900 hover:underline"
        >
          Close the gap <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}
