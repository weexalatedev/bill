import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, Gauge, MapPin, PlugZap, Search } from 'lucide-react';
import { useApp } from '../store';
import type { SiteStatus } from '../types';
import { Badge, Card, SectionHeading, StatCard, type Tone } from '../components/ui';
import { gbp, signedGbp } from '../lib/format';

const statusTone: Record<SiteStatus, Tone> = {
  Optimal: 'emerald',
  Watch: 'amber',
  Anomaly: 'rose',
};

export default function Sites() {
  const { sites, annualSpendTotal, metrics } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'All' | SiteStatus>('All');
  const [type, setType] = useState<string>('All');

  const types = useMemo(() => ['All', ...Array.from(new Set(sites.map((s) => s.type)))], [sites]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((site) => {
      const matchesStatus = status === 'All' || site.status === status;
      const matchesType = type === 'All' || site.type === type;
      const matchesQuery =
        q.length === 0 || `${site.name} ${site.city} ${site.region}`.toLowerCase().includes(q);
      return matchesStatus && matchesType && matchesQuery;
    });
  }, [sites, query, status, type]);

  const controllableLoads = sites.reduce((total, site) => total + site.loads.length, 0);
  const attention = sites.filter((s) => s.status !== 'Optimal').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sites connected"
          value={String(sites.length)}
          icon={<Building2 className="h-5 w-5" />}
          tone="sky"
          sub="in the Energy Data OS"
        />
        <StatCard
          label="Annual energy spend"
          value={gbp(annualSpendTotal)}
          icon={<Gauge className="h-5 w-5" />}
          tone="slate"
          sub="across the portfolio"
        />
        <StatCard
          label="Controllable loads"
          value={String(controllableLoads)}
          icon={<PlugZap className="h-5 w-5" />}
          tone="violet"
          sub="ready for optimisation"
        />
        <StatCard
          label="Needs attention"
          value={String(attention)}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
          sub="watch or anomaly status"
        />
      </div>

      <Card>
        <SectionHeading
          title="Portfolio"
          subtitle="Every site gets a continuously updated digital energy model."
          action={
            <Badge tone="emerald">
              Saved this month {signedGbp(metrics.savings)}
            </Badge>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites…"
              className="w-44 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'All' | SiteStatus)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
          >
            {(['All', 'Optimal', 'Watch', 'Anomaly'] as const).map((option) => (
              <option key={option} value={option}>
                {option === 'All' ? 'All statuses' : option}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
          >
            {types.map((option) => (
              <option key={option} value={option}>
                {option === 'All' ? 'All types' : option}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((site) => {
            const saving = site.monthExpected - site.monthActual;
            return (
              <div
                key={site.id}
                className="flex flex-col rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{site.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {site.city}, {site.region}
                    </p>
                  </div>
                  <Badge tone={statusTone[site.status]}>{site.status}</Badge>
                </div>

                <p className="mt-2 text-xs font-medium text-slate-400">{site.type}</p>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">This month</p>
                    <p className="text-sm font-bold text-slate-900">{gbp(site.monthActual)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Saved</p>
                    <p className="text-sm font-bold text-emerald-600">{signedGbp(saving)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Annual</p>
                    <p className="text-sm font-bold text-slate-900">{gbp(site.annualSpend)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {site.loads.map((load) => (
                    <span
                      key={load}
                      className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    >
                      {load}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <PlugZap className="h-3.5 w-3.5" />
                    {site.meterType} meter
                  </span>
                  <span>Synced {site.lastSynced}</span>
                </div>
              </div>
            );
          })}
        </div>
        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            No sites match your filters.
          </p>
        )}
      </Card>
    </div>
  );
}