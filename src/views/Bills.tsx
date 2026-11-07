'use client';
/**
 * /bills — Invoices. Primary intake: upload a bill, the AI reads it (OCR if
 * needed), audits against the Ofgem cap, writes advice, files it per site.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, Loader2, MessageSquareText, Search, ShieldCheck, Upload } from 'lucide-react';
import { useApp } from '../store';
import type { IntakeResult } from '../lib/api';
import type { BillStatus, FindingSeverity, Invoice } from '../types';
import { Badge, Card, EmptyState, SectionHeading, StatCard, type Tone } from '../components/ui';
import { cx } from '../lib/cx';
import { gbp, gbp2, kwh, num, pence, signedGbp } from '../lib/format';

type Filter = 'All' | BillStatus;

const statusTone: Record<BillStatus, 'muted' | 'outline' | 'solid'> = { Clean: 'muted', Flagged: 'solid', Recovered: 'outline' };
const severityDot: Record<FindingSeverity, string> = { high: 'bg-ink-900', medium: 'bg-neutral-500', low: 'bg-neutral-400', info: 'bg-neutral-300' };

function scoreTone(score: number): Tone { if (score >= 85) return 'muted'; if (score >= 60) return 'outline'; return 'solid'; }

interface FormState { siteId: string; supplier: string; period: string; consumptionKwh: string; unitRateP: string; standingChargeP: string; }

const field = 'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12';
const labelCls = 'mb-1 block text-xs font-medium text-neutral-600';
/** The primary upload card: pick a site, drop a bill, read the AI audit. */
function UploadBillCard({ onSaved }: { onSaved: (invoice: Invoice) => void }) {
  const { sites, analyseBillFile } = useApp();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ result: IntakeResult; invoice: Invoice | null } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = async (file?: File) => {
    if (!file || busy) return;
    if (!siteId) { setError('Choose a site first — the bill is filed against it.'); return; }
    setBusy(true); setError(null); setOutcome(null);
    try {
      const res = await analyseBillFile(file, siteId);
      if (res.result.ok) { setOutcome(res); if (res.invoice) onSaved(res.invoice); }
      else { setError(res.result.note ?? 'We could not read that bill.'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'We could not read that file.'); }
    finally { setBusy(false); }
  };

  const analysis = outcome?.result.analysis ?? null;
  const advice = outcome?.result.advice ?? null;
  const extracted = (outcome?.result.extracted ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string => (typeof value === 'string' ? value : '');
  const total = typeof extracted.totalGbp === 'number' ? extracted.totalGbp : null;
  const savingsPct = analysis && total && total > 0 ? (analysis.recoverableGbp / total) * 100 : null;
  const siteName = outcome?.invoice ? sites.find((s) => s.id === outcome.invoice!.siteId)?.name : undefined;

  if (sites.length === 0) {
    return (
      <Card>
        <SectionHeading title="Upload a bill" subtitle="Add a site first — every invoice is filed and benchmarked per site." />
        <Link href="/sites" className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">
          Add your first site <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeading title="Upload a bill" subtitle="PDF, photo or text — we read it (OCR if needed), audit it and file it against the site." />

      <label className="mb-3 block max-w-xs">
        <span className={labelCls}>File against site</span>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={field}>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.city ? ` · ${site.city}` : ''}</option>)}
        </select>
      </label>

      {outcome && (
        <div className="mt-4 space-y-4 rounded-lg border border-neutral-100 bg-neutral-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{str(extracted.supplier) || 'Your bill'}{str(extracted.periodStart) ? ` · ${str(extracted.periodStart)} → ${str(extracted.periodEnd)}` : ''}</p>
              <p className="text-xs text-neutral-600">{outcome.result.usedVision ? 'Read with OCR (no text layer)' : 'Read from the text layer'} · {outcome.result.textLength.toLocaleString()} characters</p>
            </div>
            {analysis && <Badge tone={scoreTone(analysis.score)}>Bill score {analysis.score}/100</Badge>}
          </div>
          {analysis && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-white p-3 ring-1 ring-neutral-100">
                <p className="text-xs text-neutral-600">Potential saving</p>
                <p className="text-lg font-semibold text-neutral-700">{gbp(analysis.recoverableGbp)}</p>
                <p className="text-xs text-neutral-600">{savingsPct !== null ? `${savingsPct.toFixed(1)}% of the bill` : 'recoverable overcharge'}</p>
              </div>
              <div className="rounded-md bg-white p-3 ring-1 ring-neutral-100">
                <p className="text-xs text-neutral-600">Effective rate</p>
                <p className="text-lg font-semibold text-neutral-900">{pence(analysis.effectiveRateP ?? 0, 2)}</p>
                <p className="text-xs text-neutral-600">vs cap {pence(analysis.capPeriod.averageUnitRateP, 2)}/kWh</p>
              </div>
              <div className="rounded-md bg-white p-3 ring-1 ring-neutral-100">
                <p className="text-xs text-neutral-600">Findings</p>
                <p className="text-lg font-semibold text-neutral-900">{analysis.findings.length}</p>
                <p className="text-xs text-neutral-600">{analysis.findings.filter((f) => f.severity === 'high').length} high severity</p>
              </div>
            </div>
          )}
          {analysis && analysis.findings.length > 0 && (
            <ul className="space-y-2">
              {analysis.findings.slice(0, 4).map((finding) => (
                <li key={finding.code} className="flex gap-3 rounded-md bg-white p-3 ring-1 ring-neutral-100">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', severityDot[finding.severity])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-800">{finding.title}</p>
                      {finding.impactGbp > 0 && <span className="shrink-0 text-sm font-semibold text-neutral-600">{signedGbp(finding.impactGbp)}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-600">{finding.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {advice?.summary && (
            <div className="rounded-md bg-white p-3 ring-1 ring-neutral-100">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800"><MessageSquareText className="h-4 w-4 text-neutral-600" /> Advice</p>
              <p className="mt-1 text-sm text-neutral-600">{advice.summary}</p>
              {advice.actions.length > 0 && <ul className="mt-2 space-y-1">{advice.actions.map((action) => <li key={action} className="flex items-start gap-2 text-xs text-neutral-600"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />{action}</li>)}</ul>}
            </div>
          )}
          {outcome.invoice ? (
            <div className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 ring-1 ring-neutral-100">
              <p className="text-xs text-neutral-600">Filed against <strong className="text-neutral-700">{siteName}</strong> as {outcome.invoice.id}</p>
              <Link href="/analysis" className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 transition-colors hover:text-neutral-800">Full benchmark <ArrowRight className="h-3 w-3" /></Link>
            </div>
          ) : (
            <p className="text-xs text-neutral-600">Some figures were unreadable, so the bill was analysed but not filed — check the findings above, or enter the figures manually below.</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Collapsed fallback for bills the AI could not fully read. */
function ManualEntryCard({ onCreated }: { onCreated: (invoice: Invoice) => void }) {
  const { sites, suppliers, analyseUpload } = useApp();
  const [form, setForm] = useState<FormState>({ siteId: sites[0]?.id ?? '', supplier: suppliers[0] ?? '', period: '', consumptionKwh: '', unitRateP: '', standingChargeP: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const consumptionKwh = Number(form.consumptionKwh);
    const unitRateP = Number(form.unitRateP);
    const standingChargeP = Number(form.standingChargeP);
    if (!form.siteId || !form.supplier.trim() || !form.period.trim()) { setError('Site, supplier and billing period are required.'); return; }
    if (!Number.isFinite(consumptionKwh) || consumptionKwh <= 0) { setError('Enter the consumption in kWh.'); return; }
    if (!Number.isFinite(unitRateP) || unitRateP <= 0) { setError('Enter the unit rate in p/kWh.'); return; }
    if (!Number.isFinite(standingChargeP) || standingChargeP < 0) { setError('Enter the standing charge in p/day.'); return; }
    setBusy(true); setError(null);
    try {
      const invoice = await analyseUpload({ siteId: form.siteId, supplier: form.supplier.trim(), period: form.period.trim(), consumptionKwh, unitRateP, standingChargeP });
      onCreated(invoice);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not audit that bill.'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-700">Can’t upload? Type the figures in →</summary>
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Site</label>
            <select className={field} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Supplier</label>
            <input className={field} value={form.supplier} placeholder="British Gas" onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Billing period</label>
            <input className={field} value={form.period} placeholder="Feb 2026" onChange={(e) => setForm({ ...form, period: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>kWh</label>
              <input type="number" className={field} placeholder="38000" value={form.consumptionKwh} onChange={(e) => setForm({ ...form, consumptionKwh: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>p/kWh</label>
              <input type="number" step="0.1" className={field} placeholder="27.6" value={form.unitRateP} onChange={(e) => setForm({ ...form, unitRateP: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>p/day</label>
              <input type="number" step="0.1" className={field} placeholder="88" value={form.standingChargeP} onChange={(e) => setForm({ ...form, standingChargeP: e.target.value })} />
            </div>
          </div>
          {error && <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">{error}</p>}
          <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{busy ? 'Auditing…' : 'Run audit'}
          </button>
        </div>
      </details>

    </Card>
  );
}

export default function Bills() {
  const { invoices, sites, metrics, recoverInvoice, getSiteById } = useApp();

  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchesFilter = filter === 'All' || inv.status === filter;
      const site = getSiteById(inv.siteId);
      const matchesQuery = q.length === 0 || inv.id.toLowerCase().includes(q) || inv.supplier.toLowerCase().includes(q) || (site ? `${site.name} ${site.city ?? ''}`.toLowerCase().includes(q) : false);
      return matchesFilter && matchesQuery;
    });
  }, [invoices, filter, query, getSiteById]);

  const selected = invoices.find((inv) => inv.id === selectedId) ?? null;
  const recoveredValue = invoices.filter((inv) => inv.status === 'Recovered').flatMap((inv) => inv.issues).reduce((total, issue) => total + Math.abs(issue.impact), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invoices audited" value={num(metrics.invoicesAudited)} icon={<FileSearch className="h-5 w-5" />} tone="muted" sub="filed across your sites" />
        <StatCard label="Open issues" value={String(metrics.issuesOpen)} icon={<AlertTriangle className="h-5 w-5" />} tone="solid" sub="awaiting challenge" />
        <StatCard label="Value at risk" value={gbp(metrics.issuesValue)} icon={<ShieldCheck className="h-5 w-5" />} tone="solid" sub="overcharges found" />
        <StatCard label="Recovered to date" value={gbp(recoveredValue)} icon={<CheckCircle2 className="h-5 w-5" />} tone="solid" sub="challenged with suppliers" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Flagged', 'Clean', 'Recovered'] as Filter[]).map((option) => (
                <button key={option} type="button" onClick={() => setFilter(option)} className={'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ' + (filter === option ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}>{option}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5">
              <Search className="h-4 w-4 text-neutral-600" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoices…" className="w-40 bg-transparent text-sm text-neutral-700 placeholder:text-neutral-600 focus:outline-none" />
            </div>
          </div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-y border-neutral-100 bg-neutral-50/70 text-left text-xs uppercase tracking-wide text-neutral-600"><th className="px-4 py-2.5 font-semibold">Invoice</th><th className="px-4 py-2.5 font-semibold">Site</th><th className="px-4 py-2.5 font-semibold">Consumption</th><th className="px-4 py-2.5 font-semibold">Unit rate</th><th className="px-4 py-2.5 text-right font-semibold">Total</th><th className="px-4 py-2.5 font-semibold">Status</th></tr></thead>
              <tbody>
                {filtered.map((inv) => {
                  const site = getSiteById(inv.siteId);
                  return (
                    <tr key={inv.id} onClick={() => setSelectedId(inv.id)} className={'cursor-pointer border-b border-neutral-50 transition-colors ' + (inv.id === selectedId ? 'bg-neutral-50/60' : 'hover:bg-neutral-50')}>
                      <td className="px-4 py-3"><p className="font-semibold text-neutral-800">{inv.id}</p><p className="text-xs text-neutral-600">{inv.period}</p></td>
                      <td className="px-4 py-3"><p className="text-neutral-700">{site?.name ?? inv.siteId}</p><p className="text-xs text-neutral-600">{site?.city} · {inv.supplier}</p></td>
                      <td className="px-4 py-3 text-neutral-600">{kwh(inv.consumptionKwh)}</td>
                      <td className="px-4 py-3 text-neutral-600">{pence(inv.unitRateP)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-800">{gbp2(inv.total)}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone[inv.status]}>{inv.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="p-4"><EmptyState title="No invoices match" hint="Try a different filter or search term." /></div>}
          </div>
        </Card>
        <Card className="sticky top-24 space-y-4">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-600">Invoice detail</p>
                  <p className="text-lg font-semibold text-neutral-900">{selected.id}</p>
                  <p className="text-xs text-neutral-600">{getSiteById(selected.siteId)?.name} · {selected.period}</p>
                </div>
                <Badge tone={statusTone[selected.status]}>{selected.status}</Badge>
              </div>
              <dl className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
                <div className="flex justify-between"><dt className="text-neutral-600">Supplier</dt><dd className="font-medium text-neutral-800">{selected.supplier}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-600">Consumption</dt><dd className="font-medium text-neutral-800">{kwh(selected.consumptionKwh)}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-600">Energy charge</dt><dd className="font-medium text-neutral-800">{gbp2((selected.consumptionKwh * selected.unitRateP) / 100)}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-600">Standing charge</dt><dd className="font-medium text-neutral-800">{gbp2((selected.standingChargeP * 31) / 100)}</dd></div>
                <div className="flex justify-between border-t border-neutral-200 pt-2"><dt className="font-semibold text-neutral-700">Invoice total (ex. VAT)</dt><dd className="font-semibold text-neutral-900">{gbp2(selected.total)}</dd></div>
              </dl>
              <div className="px-4 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-800"><ShieldCheck className="h-4 w-4 text-neutral-600" /> Audit findings</p>
                {selected.issues.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700"><CheckCircle2 className="h-4 w-4" /> No issues detected — this invoice looks correct.</div>
                ) : (
                  <ul className="space-y-2">
                    {selected.issues.map((issue) => (
                      <li key={issue.type} className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3">
                        <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-neutral-700">{issue.type}</p>{issue.impact < 0 && <span className="text-sm font-semibold text-neutral-700">{signedGbp(issue.impact)}</span>}</div>
                        <p className="mt-1 text-xs text-neutral-600/90">{issue.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {selected.status === 'Flagged' ? (
                  <button type="button" onClick={() => recoverInvoice(selected.id)} className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">Challenge supplier &amp; request recovery</button>
                ) : selected.status === 'Recovered' ? (
                  <div className="rounded-md bg-neutral-50 px-4 py-2.5 text-center text-sm font-semibold text-neutral-700">Recovery in progress</div>
                ) : null}
              </div>
            </>
          ) : (
            <Card><EmptyState title="Select an invoice" hint="Choose a row to see the audit detail." /></Card>
          )}
        </Card>
      </div>
    </div>
  );
}
