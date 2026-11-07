'use client';
import Link from 'next/link';
import { ArrowRight, Database, FileSpreadsheet, Receipt, Sparkles } from 'lucide-react';
import { useApp } from '../../store';
import { Badge, Card, EmptyState, ProgressBar, SectionHeading } from '../ui';

const SOURCE_COPY = {
  hh: { label: 'Half-hourly', tone: 'solid' as const, hint: 'Measured load shape — the full optimisation layer' },
  'bill-only': { label: 'Bill only', tone: 'muted' as const, hint: 'Costs are real; the shape of the day is estimated' },
  none: { label: 'No data', tone: 'ghost' as const, hint: 'Nothing to analyse until a bill or meter reading lands' },
};

/**
 * Data coverage — the plan's Step 1, made visible.
 *
 * “No data, no savings.” This tab shows what each site actually has, what it
 * would unlock, and the shortest route to close the gap, rather than a generic
 * “improve your data” banner.
 */
export default function DataPanel() {
  const { sites, invoices, actions } = useApp();

  const withHh = sites.filter((site) => site.dataQuality?.consumption === 'hh').length;
  const billOnly = sites.filter((site) => site.dataQuality?.consumption === 'bill-only').length;
  const none = sites.length - withHh - billOnly;
  const coverage =
    sites.length === 0
      ? 0
      : Math.round(sites.reduce((total, site) => total + (site.dataQuality?.coveragePct ?? 0), 0) / sites.length);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Data confidence', value: `${coverage}%`, hint: 'average coverage across sites', icon: Sparkles },
          { label: 'Half-hourly sites', value: `${withHh}/${sites.length}`, hint: `${billOnly} bill-only · ${none} with nothing`, icon: Database },
          { label: 'Invoices audited', value: String(invoices.length), hint: `${actions.length} opportunities derived`, icon: Receipt },
        ].map(({ label, value, hint, icon: Icon }) => (
          <Card key={label}>
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-neutral-600">
              <Icon className="h-3.5 w-3.5" /> {label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
            <p className="mt-0.5 text-xs text-neutral-700">{hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <SectionHeading
          title="Coverage per site"
          subtitle="A site is only as optimisable as the data behind it. Close the gaps top-down."
          action={<Badge tone="muted">{sites.length} sites</Badge>}
        />
        {sites.length === 0 ? (
          <EmptyState title="No sites to measure yet" hint="Add a site, then import a bill or half-hourly readings." />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-[11px] tracking-wide text-neutral-600">
                <th className="py-2 pr-3 font-medium">Site</th>
                <th className="py-2 pr-3 font-medium">Meter</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Coverage</th>
                <th className="py-2 pr-3 font-medium">Invoices</th>
                <th className="py-2 text-right font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const key = (site.dataQuality?.consumption ?? 'none') as keyof typeof SOURCE_COPY;
                const source = SOURCE_COPY[key];
                const invoicesForSite = invoices.filter((invoice) => invoice.siteId === site.id).length;
                return (
                  <tr key={site.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-ink-900">{site.name}</td>
                    <td className="py-2.5 pr-3 text-neutral-700">{site.meterType}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={source.tone}>{source.label}</Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <ProgressBar value={site.dataQuality?.coveragePct ?? 0} tone={source.tone} />
                        </div>
                        <span className="text-xs tabular-nums text-neutral-700">
                          {site.dataQuality?.coveragePct ?? 0}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-neutral-700">{invoicesForSite}</td>
                    <td className="py-2.5 text-right">
                      {key === 'hh' ? (
                        <Link href="/data" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-900 hover:underline">
                          Analyse <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <Link href={invoicesForSite > 0 ? '/data' : '/bills'} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-900 hover:underline">
                          {invoicesForSite > 0 ? 'Import HH' : 'Add a bill'} <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <Card className="bg-surface">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <FileSpreadsheet className="h-4 w-4" /> What each step unlocks
        </p>
        <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-neutral-700 sm:grid-cols-2">
          <li>• A bill alone: cost is real, the day is guessed — good for rate errors.</li>
          <li>• Half-hourly data: overnight waste, peak demand and shifting become provable.</li>
          <li>• A year of bills: the baseline that makes a saving “verified”, not “estimated”.</li>
          <li>• A connected device: the tariff and the reading stop drifting apart.</li>
        </ul>
      </Card>
    </div>
  );
}
