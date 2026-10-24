import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Receipt,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api, ApiError, type PublicBillCheck as Result } from '../lib/api';
import { Badge, Card, type Tone } from '../components/ui';
import { gbp, gbp2, pence } from '../lib/format';
import { cx } from '../lib/cx';

const severityTone: Record<string, Tone> = {
  high: 'rose',
  medium: 'amber',
  low: 'sky',
  info: 'slate',
};

const field =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15';
const label = 'mb-1 block text-xs font-medium text-slate-500';

interface Form {
  supplier: string;
  postcode: string;
  periodStart: string;
  periodEnd: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
  totalGbp: string;
  vatGbp: string;
}

const empty: Form = {
  supplier: '',
  postcode: '',
  periodStart: '',
  periodEnd: '',
  consumptionKwh: '',
  unitRateP: '',
  standingChargeP: '',
  totalGbp: '',
  vatGbp: '',
};

const EXAMPLE: Form = {
  supplier: 'British Gas Lite',
  postcode: 'M1 4BT',
  periodStart: '2026-02-01',
  periodEnd: '2026-02-28',
  consumptionKwh: '9200',
  unitRateP: '29.4',
  standingChargeP: '62',
  totalGbp: '2885',
  vatGbp: '96',
};

function numOrUndef(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

export default function PublicBillCheck() {
  const [form, setForm] = useState<Form>(empty);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.publicBillCheck({
        supplier: strOrUndef(form.supplier),
        postcode: strOrUndef(form.postcode),
        periodStart: strOrUndef(form.periodStart),
        periodEnd: strOrUndef(form.periodEnd),
        consumptionKwh: numOrUndef(form.consumptionKwh),
        unitRateP: numOrUndef(form.unitRateP),
        standingChargeP: numOrUndef(form.standingChargeP),
        totalGbp: numOrUndef(form.totalGbp),
        vatGbp: numOrUndef(form.vatGbp),
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'We could not check that bill just now. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const findings = result?.findings ?? [];
  const actionable = findings.filter((f) => Math.abs(f.impactGbp) > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-sm">
              <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
            </span>
            <span className="text-sm font-bold text-slate-900">EnerOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/sign-in" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link
              to="/get-started"
              className="rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Upload a bill
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 max-w-2xl">
          <Badge tone="emerald">Free · no account needed</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Check your electricity bill for free
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            We re-add every line and check your rates against Ofgem reference prices for your
            region. In seconds you'll see what looks wrong — and roughly what it could be worth.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Receipt className="h-4 w-4 text-emerald-600" /> Your bill
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm(EXAMPLE);
                  setResult(null);
                  setError(null);
                }}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Use an example
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Supplier</span>
                  <input value={form.supplier} onChange={set('supplier')} placeholder="e.g. British Gas Lite" className={field} />
                </div>
                <div>
                  <span className={label}>Postcode</span>
                  <input value={form.postcode} onChange={set('postcode')} placeholder="M1 4BT" className={field} />
                </div>
                <div>
                  <span className={label}>Period start</span>
                  <input type="date" value={form.periodStart} onChange={set('periodStart')} className={field} />
                </div>
                <div>
                  <span className={label}>Period end</span>
                  <input type="date" value={form.periodEnd} onChange={set('periodEnd')} className={field} />
                </div>
                <div>
                  <span className={label}>Consumption (kWh)</span>
                  <input inputMode="decimal" value={form.consumptionKwh} onChange={set('consumptionKwh')} placeholder="9200" className={field} />
                </div>
                <div>
                  <span className={label}>Unit rate (p/kWh)</span>
                  <input inputMode="decimal" value={form.unitRateP} onChange={set('unitRateP')} placeholder="29.4" className={field} />
                </div>
                <div>
                  <span className={label}>Standing charge (p/day)</span>
                  <input inputMode="decimal" value={form.standingChargeP} onChange={set('standingChargeP')} placeholder="62" className={field} />
                </div>
                <div>
                  <span className={label}>Total charged (£)</span>
                  <input inputMode="decimal" value={form.totalGbp} onChange={set('totalGbp')} placeholder="2885" className={field} />
                </div>
                <div>
                  <span className={label}>VAT charged (£)</span>
                  <input inputMode="decimal" value={form.vatGbp} onChange={set('vatGbp')} placeholder="96" className={field} />
                </div>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Check this bill
              </button>
              <p className="text-center text-[11px] text-slate-400">
                We don't store this bill. Nothing is shared.
              </p>
            </form>
          </Card>

          <div className="space-y-4">
            {!result && !busy && (
              <Card className="flex h-full flex-col items-center justify-center py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">Your result appears here</p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Fill in what you can — even just the total and unit rate is enough to find
                  arithmetic and rate issues.
                </p>
              </Card>
            )}


            {result && (
              <>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Potentially recoverable</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                      {gbp2(result.recoverableGbp)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {findings.length} finding{findings.length === 1 ? '' : 's'} on this bill
                      {result.region ? ` · benchmarked against ${result.region.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Bill health</p>
                    <p
                      className={cx(
                        'text-2xl font-bold',
                        result.score >= 85
                          ? 'text-emerald-600'
                          : result.score >= 60
                            ? 'text-amber-600'
                            : 'text-rose-600',
                      )}
                    >
                      {result.score}/100
                    </p>
                    {result.effectiveRateP !== null && (
                      <p className="text-xs text-slate-400">
                        Effective {pence(result.effectiveRateP, 2)}/kWh
                      </p>
                    )}
                  </div>
                </Card>

                <Card>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">What we found</p>
                    <Badge tone="slate">Ofgem cap: {pence(result.capPeriod.averageUnitRateP, 2)}</Badge>
                  </div>

                  {findings.length === 0 ? (
                    <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      Nothing obvious on this bill. That's a good sign — the arithmetic, rates and
                      VAT all reconcile.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {findings.map((f, i) => (
                        <li key={`${f.code}-${i}`} className="rounded-xl border border-slate-100 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2">
                              <Badge tone={severityTone[f.severity] ?? 'slate'}>{f.severity}</Badge>
                              <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                            </div>
                            {Math.abs(f.impactGbp) > 0 && (
                              <span className="shrink-0 font-mono text-sm font-semibold text-slate-800">
                                {gbp(f.impactGbp)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{f.detail}</p>
                          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-emerald-700">
                            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                            {f.recommendation}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {result.note}
                  </p>
                </Card>

                <Card className="bg-ink-900 text-white">
                  <p className="text-sm font-semibold">Want the fixes, not just the findings?</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    EnerOS watches your half-hourly usage, finds overnight waste and tariff savings,
                    and verifies the money you save — from £49 per site per month.
                    {actionable.length > 0
                      ? ` This bill alone suggests ${gbp(result.recoverableGbp)} to recover.`
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/sign-up"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-ink-900 hover:bg-emerald-400"
                    >
                      Create a free account <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/check"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      Check another bill
                    </Link>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

