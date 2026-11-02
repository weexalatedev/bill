'use client';
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
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 py-0.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="capitalize">{entry.name}</span>
          <span className="ml-auto pl-3 font-semibold text-slate-900">
            {gbp(Number(entry.value))}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { account, sites, monthly, assetMix, metrics, actions, invoices, getSiteById } = useApp();

  const mixTotal = assetMix.reduce((total, slice) => total + slice.spend, 0);
  const topSites = [...sites].sort((a, b) => b.monthActual - a.monthActual).slice(0, 6);

  const findings = [
    ...invoices
      .filter((inv) => inv.status === 'Flagged')
      .flatMap((inv) =>
        inv.issues.map((issue) => ({
          id: `${inv.id}-${issue.type}`,
          tone: 'rose' as const,
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
        tone: 'emerald' as const,
        title: a.title,
        detail: a.rationale,
        meta: `${getSiteById(a.siteId)?.name ?? a.siteId} · ${a.asset}`,
        value: a.monthlySaving,
      })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {account.name} · {account.sites} sites · billing period Mar 2026
        </p>
        <Badge tone="emerald">
          <ShieldCheck className="h-3.5 w-3.5" />
          Savings measured, not estimated
        </Badge>
      </div>

      {(sites.length === 0 || invoices.length === 0) && (
        <SetupChecklist siteCount={sites.length} invoiceCount={invoices.length} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Energy spend this month"
          value={gbp(metrics.spendActual)}
          icon={<Gauge className="h-5 w-5" />}
          tone="sky"
          trend={{ value: metrics.momChangePct, goodWhenNegative: true }}
          sub="vs last month"
        />
        <StatCard
          label="Expected spend"
          value={gbp(metrics.spendExpected)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="slate"
          sub="baseline before optimisation"
        />
        <StatCard
          label="Verified savings"
          value={gbp(metrics.savings)}
          icon={<PiggyBank className="h-5 w-5" />}
          tone="emerald"
          sub={`${pct(metrics.savingsRate)} below baseline`}
        />
        <StatCard
          label="Bill issues open"
          value={String(metrics.issuesOpen)}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
          sub={`${gbp(metrics.issuesValue)} recoverable`}
        />
      </div>

      <Card>
        <SectionHeading
          title="Spend vs expected baseline"
          subtitle="Baseline → intervention → measured outcome. Trailing 12 months."
          action={
            <div className="hidden items-center gap-4 text-xs sm:flex">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Expected
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Actual
              </span>
            </div>
          }
        />
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                tickFormatter={(value: number) => compactGbp(value)}
                width={64}
              />
              <Tooltip content={<SpendTooltip />} />
              <Area
                type="monotone"
                dataKey="expected"
                name="Expected"
                stroke="#cbd5e1"
                strokeWidth={2}
                fill="#f1f5f9"
              />
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#10b981"
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
                  <span className="font-medium text-slate-700">{slice.asset}</span>
                  <span className="font-semibold text-slate-900">{gbp(slice.spend)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <ProgressBar value={share(slice.spend, mixTotal)} tone="emerald" />
                  <span className="w-10 shrink-0 text-right text-xs text-slate-400">
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
            action={<Badge tone="sky">Top 6 of {sites.length}</Badge>}
          />
          <ul className="space-y-3">
            {topSites.map((site) => {
              const saving = site.monthExpected - site.monthActual;
              return (
                <li
                  key={site.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {site.name} · {site.city}
                    </p>
                    <p className="text-xs text-slate-500">
                      {site.type} · {gbp(site.annualSpend)}/yr · {site.meterType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{gbp(site.monthActual)}</p>
                    <p className="text-xs font-medium text-emerald-600">saved {signedGbp(saving)}</p>
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
            title="Latest AI findings"
            subtitle="Anomalies, bill issues and actions the Energy Brain has taken."
          />
          <ul className="divide-y divide-slate-100">
            {findings.slice(0, 6).map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    item.tone === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <Badge tone={item.tone}>{item.tone === 'rose' ? 'Issue' : 'Automated'}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.meta}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {signedGbp(item.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col justify-between bg-ink-900 text-white">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Bill analysis in three steps
            </div>
            <ol className="mt-4 space-y-1">
              {[
                ['Add your sites', '/sites', 'Every bill is filed and benchmarked per site.'],
                ['Upload your bills', '/bills', 'PDFs or photos — the AI reads them, with OCR when needed.'],
                ['Read the savings score', '/analysis', 'Every bill is scored against the Ofgem cap.'],
              ].map(([step, to, detail], index) => (
                <li key={step}>
                  <Link
                    href={to}
                    className="group flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold group-hover:text-emerald-300">{step}</p>
                      <p className="text-xs text-slate-400">{detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-5 rounded-xl bg-white/5 p-3 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
            <p>
              {invoices.length === 0
                ? 'No bills yet — upload your first invoice and the AI audit runs instantly.'
                : `${metrics.issuesOpen} open issue${metrics.issuesOpen === 1 ? '' : 's'} across ${invoices.length} audited invoice${invoices.length === 1 ? '' : 's'}.`}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}