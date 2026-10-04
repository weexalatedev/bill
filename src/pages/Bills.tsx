import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useApp } from '../store';
import type { BillStatus } from '../types';
import { Badge, Card, EmptyState, SectionHeading, StatCard } from '../components/ui';
import { gbp, gbp2, kwh, num, pence, signedGbp } from '../lib/format';

type Filter = 'All' | BillStatus;

const statusTone: Record<BillStatus, 'emerald' | 'rose' | 'sky'> = {
  Clean: 'emerald',
  Flagged: 'rose',
  Recovered: 'sky',
};

interface FormState {
  siteId: string;
  supplier: string;
  period: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
}

const field =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';
const labelCls = 'mb-1 block text-xs font-medium text-slate-500';

export default function Bills() {
  const { invoices, sites, suppliers, metrics, analyseUpload, recoverInvoice, getSiteById } = useApp();

  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(invoices[0]?.id ?? null);
  const [form, setForm] = useState<FormState>({
    siteId: sites[0]?.id ?? '',
    supplier: suppliers[0] ?? '',
    period: 'Apr 2026',
    consumptionKwh: '38000',
    unitRateP: '27.6',
    standingChargeP: '88',
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchesFilter = filter === 'All' || inv.status === filter;
      const site = getSiteById(inv.siteId);
      const matchesQuery =
        q.length === 0 ||
        inv.id.toLowerCase().includes(q) ||
        inv.supplier.toLowerCase().includes(q) ||
        (site ? `${site.name} ${site.city}`.toLowerCase().includes(q) : false);
      return matchesFilter && matchesQuery;
    });
  }, [invoices, filter, query, getSiteById]);

  const selected = invoices.find((inv) => inv.id === selectedId) ?? null;

  const recoveredValue = invoices
    .filter((inv) => inv.status === 'Recovered')
    .flatMap((inv) => inv.issues)
    .reduce((total, issue) => total + Math.abs(issue.impact), 0);

  const submit = () => {
    const consumptionKwh = Number(form.consumptionKwh);
    const unitRateP = Number(form.unitRateP);
    const standingChargeP = Number(form.standingChargeP);
    if (!form.siteId || !form.supplier) return;
    if (!Number.isFinite(consumptionKwh) || consumptionKwh <= 0) return;
    if (!Number.isFinite(unitRateP) || unitRateP <= 0) return;
    if (!Number.isFinite(standingChargeP) || standingChargeP < 0) return;

    const created = analyseUpload({
      siteId: form.siteId,
      supplier: form.supplier,
      period: form.period,
      consumptionKwh,
      unitRateP,
      standingChargeP,
    });
    setSelectedId(created.id);
    setFilter('All');
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoices audited"
          value={num(metrics.invoicesAudited)}
          icon={<FileSearch className="h-5 w-5" />}
          tone="sky"
          sub="this billing cycle"
        />
        <StatCard
          label="Issues open"
          value={String(metrics.issuesOpen)}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
          sub="awaiting challenge"
        />
        <StatCard
          label="Value at risk"
          value={gbp(metrics.issuesValue)}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="amber"
          sub="overcharges detected"
        />
        <StatCard
          label="Recovered"
          value={gbp(recoveredValue)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="emerald"
          sub="credit notes issued"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionHeading
              title="Upload & audit an invoice"
              subtitle="Module B needs no hardware — upload a bill and the AI checks for incorrect charges, anomalies and tariff issues."
              action={<Badge tone="violet">Module B</Badge>}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Site</label>
                <select
                  className={field}
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} · {site.city}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Supplier</label>
                <select
                  className={field}
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                >
                  {suppliers.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Billing period</label>
                <input
                  className={field}
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Consumption (kWh)</label>
                <input
                  type="number"
                  className={field}
                  value={form.consumptionKwh}
                  onChange={(e) => setForm({ ...form, consumptionKwh: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Unit rate (p/kWh)</label>
                <input
                  type="number"
                  step="0.1"
                  className={field}
                  value={form.unitRateP}
                  onChange={(e) => setForm({ ...form, unitRateP: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Standing charge (p/day)</label>
                <input
                  type="number"
                  step="0.1"
                  className={field}
                  value={form.standingChargeP}
                  onChange={(e) => setForm({ ...form, standingChargeP: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Tip: unit rates above 26p/kWh or high standing charges get flagged by the audit.
              </p>
              <button
                type="button"
                onClick={submit}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                <Upload className="h-4 w-4" />
                Run AI audit
              </button>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {(['All', 'Flagged', 'Clean', 'Recovered'] as Filter[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ' +
                      (filter === option
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search invoices…"
                  className="w-40 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Invoice</th>
                    <th className="px-4 py-2.5 font-semibold">Site</th>
                    <th className="px-4 py-2.5 font-semibold">Consumption</th>
                    <th className="px-4 py-2.5 font-semibold">Unit rate</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const site = getSiteById(inv.siteId);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setSelectedId(inv.id)}
                        className={
                          'cursor-pointer border-b border-slate-50 transition-colors ' +
                          (inv.id === selectedId ? 'bg-emerald-50/60' : 'hover:bg-slate-50')
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{inv.id}</p>
                          <p className="text-xs text-slate-400">{inv.period}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700">{site?.name ?? inv.siteId}</p>
                          <p className="text-xs text-slate-400">
                            {site?.city} · {inv.supplier}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{kwh(inv.consumptionKwh)}</td>
                        <td className="px-4 py-3 text-slate-600">{pence(inv.unitRateP)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {gbp2(inv.total)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone[inv.status]}>{inv.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="p-4">
                <EmptyState title="No invoices match" hint="Try a different filter or search term." />
              </div>
            )}
          </Card>
        </div>

        <div className="lg:sticky lg:top-24">
          {selected ? (
            <Card className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Invoice detail</p>
                  <p className="text-lg font-bold text-slate-900">{selected.id}</p>
                  <p className="text-xs text-slate-500">
                    {getSiteById(selected.siteId)?.name} · {selected.period}
                  </p>
                </div>
                <Badge tone={statusTone[selected.status]}>{selected.status}</Badge>
              </div>

              <dl className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Supplier</dt>
                  <dd className="font-medium text-slate-800">{selected.supplier}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Consumption</dt>
                  <dd className="font-medium text-slate-800">{kwh(selected.consumptionKwh)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Energy charge</dt>
                  <dd className="font-medium text-slate-800">
                    {gbp2((selected.consumptionKwh * selected.unitRateP) / 100)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Standing charge</dt>
                  <dd className="font-medium text-slate-800">
                    {gbp2((selected.standingChargeP * 31) / 100)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <dt className="font-semibold text-slate-700">Invoice total (ex. VAT)</dt>
                  <dd className="font-bold text-slate-900">{gbp2(selected.total)}</dd>
                </div>
              </dl>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  AI audit findings
                </p>
                {selected.issues.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    No issues detected — this invoice looks correct.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {selected.issues.map((issue) => (
                      <li
                        key={issue.type}
                        className="rounded-xl border border-rose-100 bg-rose-50/60 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-rose-700">{issue.type}</p>
                          {issue.impact < 0 && (
                            <span className="text-sm font-semibold text-rose-700">
                              {signedGbp(issue.impact)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-rose-600/90">{issue.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selected.status === 'Flagged' ? (
                <button
                  type="button"
                  onClick={() => recoverInvoice(selected.id)}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Challenge supplier &amp; request recovery
                </button>
              ) : selected.status === 'Recovered' ? (
                <div className="rounded-lg bg-sky-50 px-4 py-2.5 text-center text-sm font-semibold text-sky-700">
                  Recovery in progress
                </div>
              ) : null}
            </Card>
          ) : (
            <Card>
              <EmptyState title="Select an invoice" hint="Choose a row to see the AI audit detail." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}