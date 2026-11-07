'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Gauge, PiggyBank, ShieldCheck, TrendingDown } from 'lucide-react';
import { useApp } from '../store';
import { Badge, Card, ProgressBar, SectionHeading, StatCard } from '../components/ui';
import SetupChecklist from '../components/SetupChecklist';
import SubscriptionSummary from '../components/SubscriptionSummary';
import DashboardTabs, { type DashboardTab } from '../components/dashboard/DashboardTabs';
import PlanPulse from '../components/dashboard/PlanPulse';
import SavingsPanel from '../components/dashboard/SavingsPanel';
import DevicesPanel from '../components/dashboard/DevicesPanel';
import DataPanel from '../components/dashboard/DataPanel';
import NextBestActions from '../components/dashboard/NextBestActions';
import { compactGbp, gbp, pct, share, signedGbp } from '../lib/format';

function SpendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-neutral-700">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 py-0.5 text-neutral-600">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="capitalize">{entry.name}</span>
          <span className="ml-auto pl-3 font-semibold text-neutral-900">
            {gbp(Number(entry.value))}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { account, sites, monthly, assetMix, metrics, actions, invoices, getSiteById } = useApp();
  const [tab, setTab] = useState<DashboardTab>('overview');
  const awaiting = actions.filter((action) => action.status === 'Recommended').length;
  const dataGaps = sites.filter((site) => site.dataQuality?.consumption !== 'hh').length;
  // Latest period actually invoiced — never a hardcoded month. Invoice periods
  // arrive as labels ("Mar 2026"), so parse them; unparseable labels fall back
  // to their position rather than inventing a date.
  const periodTime = (label: string): number => Date.parse(`1 ${label}`) || 0;
  const latestPeriod =
    [...invoices].sort((a, b) => periodTime(b.period) - periodTime(a.period))[0]?.period ?? null;

  const mixTotal = assetMix.reduce((total, slice) => total + slice.spend, 0);
  const topSites = [...sites].sort((a, b) => b.monthActual - a.monthActual).slice(0, 6);

  const findings = [
    ...invoices
      .filter((inv) => inv.status === 'Flagged')
      .flatMap((inv) =>
        inv.issues.map((issue) => ({
          id: `${inv.id}-${issue.type}`,
          kind: 'issue' as const,
          title: issue.type,
          detail: issue.detail,
          meta: `${getSiteById(inv.siteId)?.name ?? inv.siteId} · ${inv.id}`,
          value: issue.impact,
        })),
      ),
    ...actions
      .filter((a) => a.status === 'Automated')
      .slice(0, 2)
      .map((a) => ({
        id: a.id,
        kind: 'action' as const,
        title: a.title,
        detail: a.rationale,
        meta: `${getSiteById(a.siteId)?.name ?? a.siteId} · ${a.asset}`,
        value: a.monthlySaving,
      })),
  ];

  return (
    <div className="space-y-5">
      <PlanPulse onOpenTab={setTab} />

      <DashboardTabs active={tab} onChange={setTab} counts={{ savings: awaiting, data: dataGaps }} />

      {tab === 'overview' && (
        <div className="space-y-6">
      <SubscriptionSummary />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {account.name} · {account.sites} site{account.sites === 1 ? '' : 's'}
          {latestPeriod ? ` · latest bill ${latestPeriod}` : ' · no bills yet'}
        </p>
        <p className="flex items-center gap-3 text-xs text-neutral-700">
          <span className="flex items-center gap-1.5">
            <span className="eos-evidence eos-evidence--verified" aria-hidden /> Verified
          </span>
          <span className="flex items-center gap-1.5">
            <span className="eos-evidence eos-evidence--estimated" aria-hidden /> Estimated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="eos-evidence eos-evidence--issue" aria-hidden /> Issue
          </span>
        </p>
      </div>

      {(sites.length === 0 || invoices.length === 0) && (
        <SetupChecklist siteCount={sites.length} invoiceCount={invoices.length} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Energy spend this month"
          value={gbp(metrics.spendActual)}
          icon={<Gauge className="h-5 w-5" />}
          tone="muted"
          trend={{ value: metrics.momChangePct, goodWhenNegative: true }}
          sub="vs last month"
        />
        <StatCard
          label="Expected spend"
          value={gbp(metrics.spendExpected)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="muted"
          sub="baseline before optimisation"
        />
        <StatCard
          label="Verified savings"
          value={gbp(metrics.savings)}
          icon={<PiggyBank className="h-5 w-5" />}
          tone="solid"
          sub={`${pct(metrics.savingsRate)} below baseline`}
        />
        <StatCard
          label="Bill issues open"
          value={String(metrics.issuesOpen)}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="solid"
          sub={`${gbp(metrics.issuesValue)} recoverable`}
        />
      </div>

      <Card>
        <SectionHeading
          title="Spend vs expected baseline"
          subtitle="Baseline → intervention → measured outcome. Trailing 12 months."
          action={
            <div className="hidden items-center gap-4 text-xs sm:flex">
              <span className="flex items-center gap-1.5 text-neutral-600">
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" /> Expected
              </span>
              <span className="flex items-center gap-1.5 text-neutral-600">
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" /> Actual
              </span>
            </div>
          }
        />
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0a0a0a" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0a0a0a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: '#525252' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: '#525252' }}
                tickFormatter={(value: number) => compactGbp(value)}
                width={64}
              />
              <Tooltip content={<SpendTooltip />} />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="expected"
                name="Expected"
                stroke="#d4d4d4"
                strokeWidth={2}
                fill="#f5f5f5"
              />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#0a0a0a"
                strokeWidth={2.5}
                fill="url(#actualFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Where the money goes"
            subtitle="This month's spend split by controllable asset."
          />
          <ul className="space-y-3.5">
            {assetMix.map((slice) => (
              <li key={slice.asset}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-neutral-700">{slice.asset}</span>
                  <span className="font-semibold text-neutral-900">{gbp(slice.spend)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <ProgressBar value={share(slice.spend, mixTotal)} tone="solid" />
                  <span className="w-10 shrink-0 text-right text-xs text-neutral-600">
                    {share(slice.spend, mixTotal).toFixed(0)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionHeading
            title="Spend by site"
            subtitle="Highest-consuming sites this month."
            action={<Badge tone="muted">Top 6 of {sites.length}</Badge>}
          />
          <ul className="space-y-3">
            {topSites.map((site) => {
              const saving = site.monthExpected - site.monthActual;
              return (
                <li
                  key={site.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-800">
                      {site.name} · {site.city}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {site.type} · {gbp(site.annualSpend)}/yr · {site.meterType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-900">{gbp(site.monthActual)}</p>
                    <p className="text-xs font-medium text-neutral-600">saved {signedGbp(saving)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeading
            title="Latest findings"
            subtitle="Anomalies, bill issues and the actions the optimiser has taken."
          />
          <ul className="divide-y divide-neutral-100">
            {findings.slice(0, 6).map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    item.kind === 'issue' ? 'bg-ink-900' : 'bg-neutral-300'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                    <Badge tone={item.kind === 'issue' ? 'solid' : 'outline'}>
                      {item.kind === 'issue' ? 'Issue' : 'Automated'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600">{item.detail}</p>
                  <p className="mt-1 text-xs text-neutral-600">{item.meta}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink-900 tabular-nums">
                  {signedGbp(item.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <NextBestActions onOpenTab={setTab} />
      </div>
        </div>
      )}

      {tab === 'savings' && <SavingsPanel />}
      {tab === 'devices' && <DevicesPanel />}
      {tab === 'data' && <DataPanel />}
    </div>
  );
}
