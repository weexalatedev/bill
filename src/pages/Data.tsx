import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Moon,
  PlugZap,
  Upload,
} from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import {
  api,
  ApiError,
  type ConsumptionResponse,
  type ImportConsumptionResponse,
} from '../lib/api';
import { Badge, Card, SectionHeading, StatCard } from '../components/ui';
import { gbp2, kwh, pence, pct } from '../lib/format';
import { cx } from '../lib/cx';

const textareaClass =
  'w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15';

/** A 14-day sample with a mild downward trend so a saving is visible. */
function sampleCsv(): string {
  const rows = ['timestamp,kwh'];
  const start = Date.parse('2026-01-05T00:00:00Z');
  for (let d = 0; d < 14; d += 1) {
    for (let p = 0; p < 48; p += 1) {
      const t = start + d * 86_400_000 + p * 1_800_000;
      const kwhValue = p < 12 ? 1.8 : 4.2 - d * 0.06;
      rows.push(`${new Date(t).toISOString()},${kwhValue.toFixed(2)}`);
    }
  }
  return rows.join('\n');
}

export default function Data() {
  const { sites } = useApp();
  const { getToken } = useAuth();
  const [siteId, setSiteId] = useState('');
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<ImportConsumptionResponse | null>(null);
  const [data, setData] = useState<ConsumptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Default to the first site.
  useEffect(() => {
    if (!siteId && sites.length > 0) setSiteId(sites[0].id);
  }, [sites, siteId]);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const token = (await getToken()) ?? '';
        const res = await api.getConsumption(token, id);
        setData(res);
      } catch (err) {
        setData(null);
        if (err instanceof ApiError && err.status !== 404) {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    setImported(null);
    void load(siteId);
  }, [siteId, load]);

  const doImport = async () => {
    if (!siteId || csv.trim().length < 10) {
      setError('Choose a site and paste or upload a CSV first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = (await getToken()) ?? '';
      const res = await api.importConsumption(token, siteId, csv);
      setImported(res);
      setCsv('');
      await load(siteId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not import that file.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const site = sites.find((s) => s.id === siteId);
  const analysis = data?.analysis;
  const quality = data?.dataQuality;

  return (
    <div className="space-y-5">
      {/* Site + data quality */}
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <PlugZap className="h-3.5 w-3.5" /> Site with meter data
          </span>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.city}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 pb-1 text-xs text-slate-500">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </>
          ) : quality && quality.consumption === 'hh' ? (
            <Badge tone="emerald">
              Half-hourly · {quality.coveragePct}% coverage
            </Badge>
          ) : (
            <Badge tone="amber">No meter data yet — import a CSV</Badge>
          )}
          {data?.price && (
            <span className="text-slate-400">
              priced at {pence(data.price.meanP, 2)}/kWh · {data.price.source}
            </span>
          )}
        </div>
      </Card>

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <p className="flex items-start gap-2 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        </Card>
      )}

      {/* Import */}
      <Card>
        <SectionHeading
          title="Import half-hourly data"
          subtitle="Upload a supplier CSV. We accept `timestamp,kwh`, `date,time,kwh` or `date,p1..p48`. Re-uploading is safe — it updates rather than duplicates."
          action={
            <button
              type="button"
              onClick={() => setCsv(sampleCsv())}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Use sample data
            </button>
          }
        />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={5}
            placeholder={'timestamp,kwh\n2026-01-05T00:00:00Z,3.4\n2026-01-05T00:30:00Z,3.1'}
            className={textareaClass}
            spellCheck={false}
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" /> Choose file
            </button>
            <button
              type="button"
              onClick={doImport}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Import
            </button>
          </div>
        </div>

        {imported && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{imported.imported}</span> readings
            imported · {imported.stored} stored · {imported.quality.days} days ·{' '}
            {imported.quality.coveragePct}% coverage
            {imported.quality.rejected > 0 ? ` · ${imported.quality.rejected} rows skipped` : ''}
            {imported.quality.notes.length > 0 ? ` · ${imported.quality.notes.join(' ')}` : ''}
          </div>
        )}
      </Card>


      {/* Analysis */}
      {analysis && analysis.periods > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Cost over the period"
              value={gbp2(analysis.costGbp)}
              sub={`${analysis.periods} half-hours`}
              icon={<Activity className="h-5 w-5" />}
              tone="emerald"
            />
            <StatCard
              label="Average daily use"
              value={kwh(analysis.avgDailyKwh)}
              sub={`${analysis.days} days measured`}
              icon={<PlugZap className="h-5 w-5" />}
              tone="sky"
            />
            <StatCard
              label="Peak demand"
              value={`${analysis.peakKw.toFixed(1)} kW`}
              sub={`avg ${analysis.avgKw.toFixed(1)} kW`}
              icon={<Activity className="h-5 w-5" />}
              tone="violet"
            />
            <StatCard
              label="Overnight share"
              value={pct(analysis.overnightSharePct, 0)}
              sub={`${analysis.overnightAvgKw.toFixed(1)} kW base load`}
              icon={<Moon className="h-5 w-5" />}
              tone={analysis.overnightSharePct > 30 ? 'rose' : 'slate'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeading
                title="Verified savings"
                subtitle="Baseline (first half) vs recent (second half). Only shown with 14+ days."
              />
              {analysis.baseline ? (
                <div>
                  <p className="text-3xl font-bold tracking-tight text-emerald-700">
                    {gbp2(analysis.baseline.savedGbpPerMonth)}
                    <span className="ml-1 text-sm font-medium text-slate-400">/ month</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {pct(analysis.baseline.savedPct)} lower than baseline (
                    {kwh(analysis.baseline.baselineDailyKwh)} →{' '}
                    {kwh(analysis.baseline.recentDailyKwh)} per day)
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Import at least 14 days to measure a change against a baseline.
                </p>
              )}
            </Card>

            <Card>
              <SectionHeading title="Alerts" subtitle="What looks wasteful right now." />
              {analysis.alerts.length === 0 ? (
                <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Nothing unusual in this
                  data.
                </p>
              ) : (
                <ul className="space-y-2">
                  {analysis.alerts.map((a) => (
                    <li key={a.title} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={a.severity === 'high' ? 'rose' : 'amber'}>{a.severity}</Badge>
                        <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{a.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <SectionHeading
              title="Typical day"
              subtitle="Average demand by half-hour (kW). Overnight should be the floor."
            />
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.loadShape} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    interval={5}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toFixed(1)} kW`, 'Demand']}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="avgKw" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {(!analysis || analysis.periods === 0) && !loading && (
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">No meter data for {site?.name ?? 'this site'}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Import a half-hourly CSV above — or click “Use sample data” to see the analysis
            immediately. This is what turns bill checks into verified savings.
          </p>
        </Card>
      )}
    </div>
  );
}

