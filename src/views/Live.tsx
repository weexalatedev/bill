'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Clock, Leaf, Loader2, MapPin, RefreshCw, TrendingDown, Zap } from 'lucide-react';
import { useApp } from '../store';
import {
  api,
  ApiError,
  type LiveCarbonResponse,
  type LiveRate,
  type LiveTariffResponse,
} from '../lib/api';
import { Badge, Card, SectionHeading, StatCard, controlClass } from '../components/ui';
import { gbp2, pence } from '../lib/format';
import { cx } from '../lib/cx';

/** Octopus distribution region letters, in Ofgem's published order. */
const REGIONS: { letter: string; name: string }[] = [
  { letter: 'A', name: 'Eastern England' },
  { letter: 'B', name: 'East Midlands' },
  { letter: 'C', name: 'London' },
  { letter: 'D', name: 'Merseyside & North Wales' },
  { letter: 'E', name: 'West Midlands' },
  { letter: 'F', name: 'North Eastern England' },
  { letter: 'G', name: 'North Western England' },
  { letter: 'H', name: 'Southern England' },
  { letter: 'J', name: 'South Eastern England' },
  { letter: 'K', name: 'Southern Wales' },
  { letter: 'L', name: 'South Western England' },
  { letter: 'M', name: 'Yorkshire' },
  { letter: 'N', name: 'Southern Scotland' },
  { letter: 'P', name: 'Northern Scotland' },
];

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });
const stampFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const carbonTone: Record<string, 'emerald' | 'sky' | 'amber' | 'rose' | 'slate'> = {
  'very low': 'emerald',
  low: 'emerald',
  moderate: 'amber',
  high: 'rose',
  'very high': 'rose',
};

interface Point {
  i: number;
  isoFrom: string;
  isoTo: string;
  label: string;
  day: string;
  price: number;
}

/** Tooltip for the half-hourly price curve. */
function PriceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Point }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-700">
        {p.day} {p.label}
      </p>
      <p className="mt-0.5 text-slate-500">
        <span className="font-semibold text-slate-900">{pence(p.price, 2)}</span>/kWh
      </p>
    </div>
  );
}

export default function Live() {
  const { sites } = useApp();
  const [region, setRegion] = useState('');
  const [hours, setHours] = useState(3);
  const [kwh, setKwh] = useState(120);
  const [data, setData] = useState<LiveTariffResponse | null>(null);
  const [carbon, setCarbon] = useState<LiveCarbonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** The first postcode we know about — used to pick the customer's region. */
  const postcode = useMemo(() => sites.find((s) => s.postcode)?.postcode, [sites]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tariff, carbonData] = await Promise.all([
        api.getLiveTariff({ region: region || undefined, postcode, hours, kwh }),
        api.getLiveCarbon().catch(() => null),
      ]);
      setData(tariff);
      if (carbonData) setCarbon(carbonData);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the live feed.');
    } finally {
      setLoading(false);
    }
  }, [region, postcode, hours, kwh]);

  // Debounced so dragging the sliders does not spam the API.
  useEffect(() => {
    const id = window.setTimeout(load, 250);
    return () => window.clearTimeout(id);
  }, [load]);

  // Carbon refreshes on its own cadence.
  useEffect(() => {
    const id = window.setInterval(() => {
      api.getLiveCarbon().then(setCarbon).catch(() => undefined);
    }, 300_000);
    return () => window.clearInterval(id);
  }, []);

  const points = useMemo<Point[]>(
    () =>
      (data?.tariff.rates ?? []).map((rate: LiveRate, i: number) => ({
        i,
        isoFrom: rate.validFrom,
        isoTo: rate.validTo,
        label: timeFmt.format(new Date(rate.validFrom)),
        day: dayFmt.format(new Date(rate.validFrom)),
        price: rate.unitRateP,
      })),
    [data],
  );

  const indexByFrom = useMemo(() => new Map(points.map((p) => [p.isoFrom, p.i])), [points]);
  const indexByTo = useMemo(() => new Map(points.map((p) => [p.isoTo, p.i])), [points]);

  const cheapest = data?.tariff.cheapest[0] ?? null;
  const priciest = data?.tariff.priciest[0] ?? null;
  const cheapX1 = cheapest ? indexByFrom.get(cheapest.from) : undefined;
  const cheapX2 = cheapest ? indexByTo.get(cheapest.to) : undefined;
  const peakX1 = priciest ? indexByFrom.get(priciest.from) : undefined;
  const peakX2 = priciest ? indexByTo.get(priciest.to) : undefined;

  const shift = data?.shift ?? null;
  const current = data?.tariff.current ?? null;
  const carbonNow = carbon?.current ?? null;

  const windowLabel = (from?: string | null, to?: string | null): string =>
    from && to
      ? `${dayFmt.format(new Date(from))} ${timeFmt.format(new Date(from))}–${timeFmt.format(new Date(to))}`
      : '—';

  const dayBoundaries = points
    .filter((p, i) => i > 0 && p.day !== points[i - 1].day)
    .map((p) => p.i);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Distribution region
            </span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={cx(controlClass, 'w-64')}
            >
              <option value="">
                {postcode ? `Auto from ${postcode}` : 'Default (London)'}
              </option>
              {REGIONS.map((r) => (
                <option key={r.letter} value={r.letter}>
                  {r.letter} · {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 pb-1 text-xs text-slate-500">
            <Activity className="h-4 w-4 text-emerald-500" />
            {data ? (
              <span>
                {data.tariff.rates.length} half-hourly prices ·{' '}
                {data.tariff.regionName}
                {data.regionVia === 'postcode' ? ' (from postcode)' : ''}
              </span>
            ) : (
              <span>Connecting to the live market…</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </Card>

      {error && (
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="text-sm text-amber-800">{error}</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Price right now"
          value={current ? pence(current.unitRateP, 2) : '—'}
          sub={current ? `${timeFmt.format(new Date(current.validFrom))}–${timeFmt.format(new Date(current.validTo))} · Agile reference` : 'Awaiting feed'}
          icon={<Zap className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label={`Cheapest ${hours}h window`}
          value={cheapest ? pence(cheapest.avgUnitRateP, 2) : '—'}
          sub={cheapest ? windowLabel(cheapest.from, cheapest.to) : 'Awaiting feed'}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label={`Peak ${hours}h window`}
          value={priciest ? pence(priciest.avgUnitRateP, 2) : '—'}
          sub={priciest ? windowLabel(priciest.from, priciest.to) : 'Awaiting feed'}
          icon={<Activity className="h-5 w-5" />}
          tone="rose"
        />
        <StatCard
          label="Grid carbon now"
          value={carbonNow ? `${carbonNow.actual ?? carbonNow.forecast} g` : '—'}
          sub={carbonNow ? `${carbonNow.index} · gCO2/kWh` : 'Awaiting feed'}
          icon={<Leaf className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      <Card>
        <SectionHeading
          title="Half-hourly price curve"
          subtitle="Live Agile Octopus unit rates for your region, today and tomorrow. Green band = cheapest window, red = peak."
          action={
            data ? (
              <Badge tone={data.tariff.cached ? 'slate' : 'emerald'}>
                {data.tariff.cached ? 'cached' : 'live'} · {data.tariff.productCode}
              </Badge>
            ) : null
          }
        />
        {points.length === 0 ? (
          <div className="grid h-64 place-items-center text-sm text-slate-400">
            {loading ? 'Loading live prices…' : 'No live prices available.'}
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="i"
                  type="number"
                  domain={[0, points.length - 1]}
                  tickFormatter={(i: number) => points[i]?.label ?? ''}
                  interval={Math.max(1, Math.floor(points.length / 8))}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => `${v}p`}
                  width={48}
                />
                <Tooltip content={<PriceTooltip />} />
                {cheapX1 !== undefined && cheapX2 !== undefined && (
                  <ReferenceArea x1={cheapX1} x2={cheapX2} fill="#10b981" fillOpacity={0.12} />
                )}
                {peakX1 !== undefined && peakX2 !== undefined && (
                  <ReferenceArea x1={peakX1} x2={peakX2} fill="#f43f5e" fillOpacity={0.1} />
                )}
                {dayBoundaries.map((i) => (
                  <ReferenceLine key={i} x={i} stroke="#cbd5e1" strokeDasharray="3 3" />
                ))}
                <Area
                  type="stepAfter"
                  dataKey="price"
                  name="p/kWh"
                  stroke="#0f172a"
                  strokeWidth={2}
                  fill="url(#priceFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading title={`Cheapest ${hours}h windows`} subtitle="Where flexible load should run." />
          <ul className="divide-y divide-slate-100">
            {(data?.tariff.cheapest ?? []).map((w) => (
              <li key={w.from} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="h-4 w-4 text-emerald-500" />
                  {windowLabel(w.from, w.to)}
                </span>
                <span className="font-mono text-sm font-semibold text-emerald-700">
                  {pence(w.avgUnitRateP, 2)}/kWh
                </span>
              </li>
            ))}
            {(!data || data.tariff.cheapest.length === 0) && (
              <li className="py-6 text-center text-sm text-slate-400">Awaiting live prices.</li>
            )}
          </ul>
        </Card>

        <Card>
          <SectionHeading title={`Peak ${hours}h windows`} subtitle="When to avoid discretionary load." />
          <ul className="divide-y divide-slate-100">
            {(data?.tariff.priciest ?? []).map((w) => (
              <li key={w.from} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <Activity className="h-4 w-4 text-rose-500" />
                  {windowLabel(w.from, w.to)}
                </span>
                <span className="font-mono text-sm font-semibold text-rose-700">
                  {pence(w.avgUnitRateP, 2)}/kWh
                </span>
              </li>
            ))}
            {(!data || data.tariff.priciest.length === 0) && (
              <li className="py-6 text-center text-sm text-slate-400">Awaiting live prices.</li>
            )}
          </ul>
        </Card>
      </div>

      <Card>
        <SectionHeading
          title="Live shift calculator"
          subtitle="Move a flexible load from the peak window into the cheapest one. Priced on today's real curve."
          action={<Badge tone="violet">Flexibility · Module E</Badge>}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Shiftable energy</span>
                <span className="font-mono text-slate-800">{kwh} kWh</span>
              </span>
              <input
                type="range"
                min={10}
                max={2000}
                step={10}
                value={kwh}
                onChange={(e) => setKwh(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Run duration</span>
                <span className="font-mono text-slate-800">{hours} h</span>
              </span>
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </label>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Estimated saving</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-700">
              {shift ? gbp2(shift.savingGbpPerMonth) : '—'}
              <span className="ml-1 text-sm font-medium text-slate-400">/ month</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {shift ? `${gbp2(shift.savingGbpPerCycle)} per cycle · ${pence(shift.gapP, 2)}/kWh gap` : 'Awaiting live prices.'}
            </p>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">From (peak)</span>
                <span className="font-medium text-slate-800">
                  {shift?.from ? `${windowLabel(shift.from.from, shift.from.to)} · ${pence(shift.from.avgUnitRateP, 2)}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">To (cheapest)</span>
                <span className="font-medium text-slate-800">
                  {shift?.to ? `${windowLabel(shift.to.from, shift.to.to)} · ${pence(shift.to.avgUnitRateP, 2)}` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Grid carbon intensity"
          subtitle="Why a half-hour is cheap — and a second signal for customers with a net-zero target."
          action={
            carbonNow ? (
              <Badge tone={carbonTone[carbonNow.index] ?? 'slate'}>{carbonNow.index}</Badge>
            ) : null
          }
        />
        {carbon && carbon.forecast.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {carbon.forecast.slice(0, 12).map((p) => (
              <div
                key={p.from}
                className="rounded-lg border border-slate-200 px-3 py-2 text-center"
              >
                <p className="text-[11px] text-slate-400">{timeFmt.format(new Date(p.from))}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {p.forecast ?? p.actual ?? '—'}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{p.index}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">Carbon feed unavailable.</p>
        )}
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        Live sources: {data?.tariff.source ?? 'Octopus Energy public tariff API'} ·{' '}
        {carbon?.source ?? 'NESO Carbon Intensity API'}. Half-hourly unit rates are a published
        market reference, not the customer's own contract; where a site is on Agile Octopus the
        figure is exact.{' '}
        {data && (
          <>
            Standing charge {pence(data.tariff.standingChargeP, 2)}/day · range{' '}
            {pence(data.tariff.stats.minUnitRateP, 2)}–{pence(data.tariff.stats.maxUnitRateP, 2)} · mean{' '}
            {pence(data.tariff.stats.meanUnitRateP, 2)} · updated{' '}
            {stampFmt.format(new Date(data.tariff.fetchedAt))}.
          </>
        )}
      </p>
    </div>
  );
}
