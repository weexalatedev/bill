import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Gauge,
  Info,
  Loader2,
  MapPin,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkles,
  Thermometer,
} from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import {
  api,
  ApiError,
  type BillQuery,
  type CapPeriod,
  type CapRegion,
  type WeatherSummary,
} from '../lib/api';
import type { AnalysisFinding, BillAnalysis, FindingSeverity } from '../types';
import { Badge, Card, SectionHeading, StatCard, type Tone } from '../components/ui';
import { gbp, gbp2, pct, pence, signedGbp } from '../lib/format';
import { cx } from '../lib/cx';

const severityTone: Record<FindingSeverity, Tone> = {
  high: 'rose',
  medium: 'amber',
  low: 'sky',
  info: 'slate',
};

const field =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';
const labelCls = 'mb-1 block text-xs font-medium text-slate-500';

interface FormState {
  supplier: string;
  periodStart: string;
  periodEnd: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
  totalGbp: string;
  vatGbp: string;
  nightShare: string;
  businessContract: boolean;
}

const emptyForm: FormState = {
  supplier: '',
  periodStart: '',
  periodEnd: '',
  consumptionKwh: '',
  unitRateP: '',
  standingChargeP: '',
  totalGbp: '',
  vatGbp: '',
  nightShare: '',
  businessContract: false,
};

/** Build the API payload, omitting anything the user left blank. */
function toQuery(form: FormState): BillQuery {
  const numOrUndef = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
  return {
    supplier: form.supplier.trim() || undefined,
    periodStart: form.periodStart || undefined,
    periodEnd: form.periodEnd || undefined,
    consumptionKwh: numOrUndef(form.consumptionKwh),
    unitRateP: numOrUndef(form.unitRateP),
    standingChargeP: numOrUndef(form.standingChargeP),
    totalGbp: numOrUndef(form.totalGbp),
    vatGbp: numOrUndef(form.vatGbp),
    nightShare: numOrUndef(form.nightShare),
    businessContract: form.businessContract || undefined,
    includeWeather: true,
  };
}

function scoreTone(score: number | undefined): Tone {
  if (score === undefined) return 'slate';
  if (score >= 85) return 'emerald';
  if (score >= 60) return 'amber';
  return 'rose';
}

/** Indicative annual cost for a region at a given usage — makes rate gaps concrete. */
function annualCostAt(region: CapRegion, annualKwh: number): string {
  return gbp(Math.round((annualKwh * region.unitRateP) / 100 + region.standingChargeP * 365));
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * /analysis — the Smart Analysis workbench.
 *
 * Everything here is computed by `server/src/lib/analysis.ts` against published
 * reference data. There is no demo dataset behind the findings: enter a real
 * bill and the engine tells you what is wrong with it, what it is worth, and
 * which licence condition to quote back at the supplier.
 */
export default function Analysis() {
  const { sites } = useApp();
  const { getToken } = useAuth();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [siteId, setSiteId] = useState('');
  const [analysis, setAnalysis] = useState<BillAnalysis | null>(null);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cap, setCap] = useState<{ period: CapPeriod; regions: CapRegion[] } | null>(null);
  const [region, setRegion] = useState<CapRegion | null>(null);
  const [postcode, setPostcode] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // The cap table is public and only changes quarterly.
  useEffect(() => {
    api
      .getPriceCap()
      .then(setCap)
      .catch(() => undefined);
  }, []);

  // Prefill the postcode, and resolve the stored region id once the table loads.
  useEffect(() => {
    let cancelled = false;
    getToken()
      .then(async (token) => {
        if (!token) return;
        try {
          const { profile } = await api.getProfile(token);
          if (cancelled) return;
          if (profile.postcode) setPostcode(profile.postcode);
          const match = cap?.regions.find((r) => r.id === profile.regionId);
          if (match) setRegion(match);
        } catch {
          // No profile yet — the user can type a postcode instead.
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getToken, cap]);

  // Live postcode → region lookup, debounced.
  useEffect(() => {
    if (postcode.trim().length < 4) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getRegion(postcode)
        .then((data) => {
          if (!cancelled && data.region) setRegion(data.region);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [postcode]);

  const comparable = useMemo(
    () => (region && cap ? cap.regions.filter((r) => r.id !== region.id).slice(0, 3) : []),
    [region, cap],
  );

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setWeather(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired — please sign in again.');
      const payload = toQuery(form);
      if (siteId) payload.siteId = siteId;
      const { analysis: result, weather: w } = await api.analyseBill(token, payload);
      setAnalysis(result);
      setWeather(w);
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof ApiError ? err.message : 'Could not analyse that bill.');
    } finally {
      setBusy(false);
    }
  };
return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Recoverable from this bill"
          value={analysis ? gbp(analysis.recoverableGbp) : '—'}
          sub={analysis ? `${analysis.findings.length} findings` : 'Run an analysis'}
          icon={<Scale className="h-5 w-5" />}
          tone={analysis && analysis.recoverableGbp > 0 ? 'rose' : 'emerald'}
        />
        <StatCard
          label="Bill health score"
          value={analysis ? `${analysis.score}/100` : '—'}
          sub={analysis?.region?.name ?? 'No region resolved'}
          icon={<Gauge className="h-5 w-5" />}
          tone={scoreTone(analysis?.score)}
        />
        <StatCard
          label="Effective rate"
          value={analysis?.effectiveRateP ? pence(analysis.effectiveRateP, 2) : '—'}
          sub={cap ? `GB average ${pence(cap.period.averageUnitRateP, 2)}` : 'All-in cost per kWh'}
          icon={<Receipt className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Regional cap"
          value={
            region ? pence(region.unitRateP, 2) : cap ? pence(cap.period.averageUnitRateP, 2) : '—'
          }
          sub={cap?.period.label}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <BillForm
          form={form}
          set={set}
          siteId={siteId}
          setSiteId={setSiteId}
          sites={sites}
          busy={busy}
          error={error}
          onSubmit={run}
          onReset={() => {
            setForm(emptyForm);
            setAnalysis(null);
            setError(null);
          }}
        />

        <div className="space-y-6">
          {!analysis && !busy && <AnalysisEmptyState />}
          {analysis && (
            <>
              <FindingsCard analysis={analysis} />
              {weather && <WeatherCard weather={weather} />}
              <BenchmarkCard
                region={region}
                postcode={postcode}
                onPostcode={setPostcode}
                cap={cap}
                comparable={comparable}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisEmptyState() {
  return (
    <Card>
      <div className="grid place-items-center px-6 py-14 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10">
          <Sparkles className="h-6 w-6 text-emerald-600" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-800">Enter a bill to start the audit</p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          The engine checks the unit rate and standing charge against Ofgem&rsquo;s cap for your
          region, re-adds the invoice arithmetic, verifies VAT treatment, and compares consumption
          with this site&rsquo;s own baseline.
        </p>
      </div>
    </Card>
  );
}
function BillForm({
  form,
  set,
  siteId,
  setSiteId,
  sites,
  busy,
  error,
  onSubmit,
  onReset,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  siteId: string;
  setSiteId: (value: string) => void;
  sites: { id: string; name: string; type: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent) => void;
  onReset: () => void;
}) {
  const text = (
    key: keyof FormState,
    placeholder: string,
    extra: Record<string, unknown> = {},
  ) => (
    <input
      type="number"
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      placeholder={placeholder}
      className={field}
      min={0}
      step="any"
      {...extra}
    />
  );

  const date = (key: 'periodStart' | 'periodEnd') => (
    <input
      type="date"
      value={form[key]}
      onChange={(e) => set(key, e.target.value)}
      className={field}
    />
  );

  return (
    <Card>
      <SectionHeading
        title="Analyse a bill"
        subtitle="Every field is optional — the engine runs whichever checks the data supports."
      />

      <form onSubmit={onSubmit} className="space-y-3.5">
        <label className="block">
          <span className={labelCls}>Supplier</span>
          <input
            value={form.supplier}
            onChange={(e) => set('supplier', e.target.value)}
            placeholder="e.g. Octopus Energy Business"
            className={field}
          />
        </label>

        <label className="block">
          <span className={labelCls}>Site — enables baseline checks</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={field}>
            <option value="">No specific site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} · {site.type}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Period start</span>
            {date('periodStart')}
          </label>
          <label className="block">
            <span className={labelCls}>Period end</span>
            {date('periodEnd')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Consumption (kWh)</span>
            {text('consumptionKwh', '12480')}
          </label>
          <label className="block">
            <span className={labelCls}>Unit rate (p/kWh)</span>
            {text('unitRateP', '26.49')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Standing charge (p/day)</span>
            {text('standingChargeP', '45.68')}
          </label>
          <label className="block">
            <span className={labelCls}>Total charged (£)</span>
            {text('totalGbp', '3300.00')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>VAT charged (£)</span>
            {text('vatGbp', '0.00')}
          </label>
          <label className="block">
            <span className={labelCls}>Off-peak share (0–1)</span>
            {text('nightShare', '0.35', { max: 1, step: '0.01' })}
          </label>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.businessContract}
            onChange={(e) => set('businessContract', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs leading-relaxed text-slate-600">
            This site is on an unregulated <strong>business contract</strong>. Business rates are not
            capped, so cap findings become advisory and the VAT check is skipped.
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {busy ? 'Analysing…' : 'Run analysis'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </form>
    </Card>
  );
}
function FindingsCard({ analysis }: { analysis: BillAnalysis }) {
  const count = analysis.findings.length;
  return (
    <Card>
      <SectionHeading
        title="Findings"
        subtitle={`${count} check${count === 1 ? '' : 's'} raised · ${gbp(
          analysis.recoverableGbp,
        )} recoverable`}
        action={
          count === 0 ? (
            <Badge tone="emerald">
              <CheckCircle2 className="h-3 w-3" /> Clean
            </Badge>
          ) : (
            <Badge tone={severityTone[analysis.findings[0].severity]}>{count} raised</Badge>
          )
        }
      />

      {count === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Nothing found. Every check the available data supports passed.
        </div>
      ) : (
        <ul className="space-y-3">
          {analysis.findings.map((finding) => (
            <FindingRow key={finding.code} finding={finding} />
          ))}
        </ul>
      )}

      <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <Fact label="Period" value={analysis.periodDays ? `${analysis.periodDays} days` : '—'} />
        <Fact
          label="Expected total"
          value={analysis.expectedTotalGbp ? gbp2(analysis.expectedTotalGbp) : '—'}
        />
        <Fact
          label="Effective rate"
          value={analysis.effectiveRateP ? `${pence(analysis.effectiveRateP, 2)}/kWh` : '—'}
        />
        <Fact label="Cap period" value={analysis.capPeriod.label} />
      </dl>
    </Card>
  );
}

function FindingRow({ finding }: { finding: AnalysisFinding }) {
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
              finding.severity === 'high'
                ? 'bg-rose-500/10 text-rose-600'
                : finding.severity === 'medium'
                  ? 'bg-amber-500/10 text-amber-600'
                  : finding.severity === 'low'
                    ? 'bg-sky-500/10 text-sky-600'
                    : 'bg-slate-500/10 text-slate-600',
            )}
          >
            {finding.severity === 'info' ? (
              <Info className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </span>
          <p className="text-sm font-semibold text-slate-900">{finding.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {finding.impactGbp !== 0 && (
            <span
              className={cx(
                'text-sm font-bold',
                finding.impactGbp > 0 ? 'text-rose-600' : 'text-emerald-600',
              )}
            >
              {signedGbp(finding.impactGbp)}
            </span>
          )}
          <Badge tone={severityTone[finding.severity]}>{finding.severity}</Badge>
        </div>
      </div>

      <p className="mt-2 pl-9 text-xs leading-relaxed text-slate-600">{finding.detail}</p>

      <div className="mt-3 pl-9">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {finding.evidence.map((item) => (
            <div key={item.label} className="flex justify-between gap-3 text-xs">
              <dt className="text-slate-500">{item.label}</dt>
              <dd className="text-right font-medium text-slate-800">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {finding.recommendation}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
            <span>Source: {finding.source.replace(/-/g, ' ')}</span>
            <span>·</span>
            <span>Confidence {pct(finding.confidence * 100, 0)}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

function WeatherCard({ weather }: { weather: WeatherSummary }) {
  return (
    <Card>
      <SectionHeading
        title="Weather normalisation"
        subtitle="Half-hourly air temperature from Elexon, used to separate seasonal effects from real anomalies."
        action={
          weather.normalised ? (
            <Badge tone="emerald">Adjusted</Badge>
          ) : (
            <Badge tone="slate">Unavailable</Badge>
          )
        }
      />
      {weather.normalised ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="Mean temperature" value={`${weather.meanTempC}°C`} icon={<Thermometer />} />
          <Fact label="Heating degree days" value={String(weather.degreeDays ?? '—')} />
          <Fact label="Balance point" value="15.5°C" />
        </div>
      ) : (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {weather.note ?? 'No temperature data was returned.'} Findings above were still produced
          — they are simply not weather-adjusted.
        </p>
      )}
    </Card>
  );
}
function BenchmarkCard({
  region,
  postcode,
  onPostcode,
  cap,
  comparable,
}: {
  region: CapRegion | null;
  postcode: string;
  onPostcode: (value: string) => void;
  cap: { period: CapPeriod; regions: CapRegion[] } | null;
  comparable: CapRegion[];
}) {
  const rows = region ? [region, ...comparable] : (cap?.regions.slice(0, 6) ?? []);

  return (
    <Card>
      <SectionHeading
        title="Ofgem price cap benchmark"
        subtitle={cap?.period.source ?? 'Energy price cap unit rates and standing charges'}
        action={cap ? <Badge tone="sky">{cap.period.label}</Badge> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-400" />
          <span className="sr-only">Postcode</span>
          <input
            value={postcode}
            onChange={(e) => onPostcode(e.target.value.toUpperCase())}
            placeholder="Postcode"
            className="w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        {region ? (
          <span className="text-xs text-slate-500">
            Benchmarking against <strong className="text-slate-800">{region.name}</strong>
          </span>
        ) : (
          <span className="text-xs text-slate-400">
            Add a postcode to benchmark against your own region rather than the GB average.
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-semibold">Region</th>
              <th className="pb-2 text-right font-semibold">Unit rate</th>
              <th className="pb-2 text-right font-semibold">Standing charge</th>
              <th className="pb-2 text-right font-semibold">£/yr @ 20M kWh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.id === region?.id ? 'bg-emerald-50/50' : undefined}>
                <td className="py-2 font-medium text-slate-800">
                  {r.name}
                  {r.id === region?.id && (
                    <Badge tone="emerald" className="ml-2">
                      yours
                    </Badge>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-xs text-slate-700">
                  {pence(r.unitRateP, 2)}
                </td>
                <td className="py-2 text-right font-mono text-xs text-slate-700">
                  {pence(r.standingChargeP, 2)}
                </td>
                <td className="py-2 text-right font-mono text-xs text-slate-700">
                  {annualCostAt(r, 20_000)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cap && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          GB average {pence(cap.period.averageUnitRateP, 2)}/kWh and{' '}
          {pence(cap.period.averageStandingChargeP, 2)}/day standing charge,{' '}
          {cap.period.changePct >= 0 ? 'up ' : 'down '}
          {Math.abs(cap.period.changePct).toFixed(1)}% on the previous quarter
          {cap.period.electricityVatPct === 0
            ? '. VAT is currently removed from domestic electricity — a bill that still shows VAT in this window is worth querying.'
            : `, with electricity VAT at ${cap.period.electricityVatPct}%.`}
        </p>
      )}
    </Card>
  );
}