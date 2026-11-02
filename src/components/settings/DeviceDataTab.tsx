'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ChevronDown, ChevronUp, Gauge, Loader2, RefreshCw, Sun, Zap } from 'lucide-react';
import {
  ConnectorApi,
  errorGuidance,
  isMeterPointFailure,
  type Dashboard,
  type Device,
  type Evidence,
  type LiveTelemetry,
  type MeterPointSummary,
  type Readiness,
  type SolisDashboard,
  type YesterdayReport,
} from '../../lib/connector';
import { Badge, Card, SectionHeading, StatCard } from '../ui';
import { gbp2, kwh, pence } from '../../lib/format';

interface Props {
  token: string;
  devices: Device[];
}

const evidenceTone: Record<Evidence, 'sky' | 'amber' | 'violet'> = {
  measured: 'sky',
  estimated: 'amber',
  guess: 'violet',
};

const evidenceLabel: Record<Evidence, string> = {
  measured: 'Measured',
  estimated: 'Estimate',
  guess: 'Possible cause',
};

const readinessTone: Record<Readiness['status'], 'emerald' | 'amber' | 'rose'> = {
  ready: 'emerald',
  limited: 'amber',
  no_data: 'rose',
};

export default function DeviceDataTab({ token, devices }: Props) {
  const octopus = devices.find((device) => device.provider === 'octopus');
  const solis = devices.find((device) => device.provider === 'solis');

  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [yesterday, setYesterday] = useState<YesterdayReport | null>(null);
  const [live, setLive] = useState<LiveTelemetry | null>(null);
  const [solisData, setSolisData] = useState<SolisDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; paused: boolean } | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!devices.length) return;
    setLoading(true);
    setError(null);
    try {
      if (octopus) {
        const ready = await ConnectorApi.getReadiness(token, octopus.connection_id);
        setReadiness(ready);
        if (ready.status === 'ready') {
          const [dash, day] = await Promise.all([
            ConnectorApi.getDashboard(token, octopus.connection_id),
            ConnectorApi.getYesterday(token, octopus.connection_id),
          ]);
          setDashboard(dash);
          setYesterday(day);
          if (ready.live.available) {
            setLive(await ConnectorApi.getLive(token, octopus.connection_id));
          } else {
            setLive(null);
          }
        } else {
          // limited / no_data: only the message and actions are meaningful.
          setDashboard(null);
          setYesterday(null);
          setLive(null);
        }
      }
      if (solis) {
        setSolisData(await ConnectorApi.getSolisDashboard(token, solis.connection_id));
      }
    } catch (err) {
      const guidance = errorGuidance(err);
      setError({ text: guidance.message, paused: guidance.paused });
    } finally {
      setLoading(false);
    }
  }, [devices.length, octopus, solis, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const electricity = (dashboard?.electricity ?? []).filter(
    (point): point is MeterPointSummary => !isMeterPointFailure(point),
  );
  const primary = electricity[0] ?? null;
  const hourly = (primary?.hourly_profile_kwh ?? []).map((value, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    kwh: value,
  }));

  if (!devices.length) {
    return (
      <Card className="p-8 text-center">
        <Gauge className="mx-auto h-6 w-6 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-800">No devices connected yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Connect Octopus or a Solis inverter on the Devices tab and its readings appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading title="Live data" />
          <p className="mt-1 text-sm text-slate-500">
            Everything except the live tile is about a day behind: the dashboard ends at the last
            full day.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            error.paused
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error.text}</span>
        </div>
      )}

      {readiness && (
        <Card className="space-y-2 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Data readiness</p>
            <div className="flex items-center gap-2">
              <Badge tone={readinessTone[readiness.status]}>{readiness.status}</Badge>
              <Badge tone="slate">{readiness.mode}</Badge>
            </div>
          </div>
          <p className="text-sm text-slate-600">{readiness.message}</p>
          {readiness.actions.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-500">
              {readiness.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {solisData && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sun className="h-4 w-4 text-amber-500" /> Solar inverter
            </p>
            <Badge tone="sky">{solisData.totals.inverter_count} inverter(s)</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Live output" value={`${solisData.totals.current_power_kw} kW`} />
            <StatCard label="Energy today" value={`${solisData.totals.energy_today_kwh} kWh`} />
            <StatCard label="Energy total" value={`${solisData.totals.energy_total_kwh} kWh`} />
          </div>
          {solisData.inverters.some((inv) => inv.missing_fields.length > 0) && (
            <p className="mt-3 text-xs text-slate-500">
              Some Solis fields were not reported by the inverter for this account.
            </p>
          )}
        </Card>
      )}

      {live?.available && live.readings && live.readings.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Zap className="h-4 w-4 text-emerald-500" /> Live demand (Home Mini)
            </p>
            <Badge tone="emerald">Near real-time</Badge>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {(Number(live.readings[live.readings.length - 1]?.demand ?? 0) / 1000).toFixed(3)} kW
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Latest reading {live.readings[live.readings.length - 1]?.readAt ?? 'unknown'}. Live data
            is never mixed into the daily totals.
          </p>
        </Card>
      )}

      {primary && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Consumption" value={kwh(primary.total_kwh)} sub={`${primary.intervals} intervals`} />
            <StatCard label="Cost" value={gbp2(primary.total_cost_gbp)} sub="incl. standing charge" />
            <StatCard
              label="Average unit price"
              value={primary.avg_unit_price_p_per_kwh === null ? '—' : pence(primary.avg_unit_price_p_per_kwh)}
            />
            <StatCard
              label="Baseload"
              value={primary.baseload_kw === null ? '—' : `${primary.baseload_kw} kW`}
              sub={primary.peak_half_hour ? `peak ${primary.peak_half_hour.kwh} kWh` : undefined}
            />
          </div>

          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-900">Average hourly profile</p>
            <p className="mt-1 text-xs text-slate-500">
              Mean kWh for each hour over the last {dashboard?.period.days ?? 30} full days.
            </p>
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} width={40} />
                  <Tooltip formatter={(value) => [`${String(value)} kWh`, 'Average']} />
                  <Bar dataKey="kwh" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {primary.notes.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                {primary.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {yesterday && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Yesterday — {yesterday.date}
              {yesterday.day_type ? ` (${yesterday.day_type})` : ''}
            </p>
            {yesterday.totals && (
              <div className="flex items-center gap-2">
                <Badge tone="slate">{kwh(yesterday.totals.kwh)}</Badge>
                <Badge tone="slate">{gbp2(yesterday.totals.cost_gbp)}</Badge>
                <Badge tone={yesterday.totals.delta_kwh >= 0 ? 'rose' : 'emerald'}>
                  {yesterday.totals.delta_pct >= 0 ? '+' : ''}
                  {yesterday.totals.delta_pct}% vs normal
                </Badge>
              </div>
            )}
          </div>

          {yesterday.status === 'insufficient_data' && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {yesterday.message}
            </p>
          )}

          <ul className="mt-3 space-y-3">
            {yesterday.findings.map((finding, index) => (
              <li key={`${finding.title}-${index}`} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={evidenceTone[finding.evidence]}>{evidenceLabel[finding.evidence]}</Badge>
                  <p className="text-sm font-semibold text-slate-900">{finding.title}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{finding.detail}</p>
                {finding.actions.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-500">
                    {finding.actions.map((action) => (
                      <li key={action.text}>
                        <span className="font-semibold text-slate-700">{action.text}</span> Effort{' '}
                        {action.effort} · risk {action.risk} · undo: {action.undo}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {yesterday?.status === 'ok' && octopus && (
        <Card className="p-5">
          <button
            type="button"
            onClick={async () => {
              if (promptText) {
                setPromptText(null);
                return;
              }
              try {
                const withPrompt = await ConnectorApi.getYesterday(
                  token,
                  octopus.connection_id,
                  undefined,
                  true,
                );
                setPromptText(withPrompt.agent_prompt ?? 'The connector returned no prompt.');
              } catch (err) {
                setError({ text: errorGuidance(err).message, paused: false });
              }
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            {promptText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {promptText ? 'Hide' : 'Show'} the instruction your AI agent receives
          </button>
          {promptText && (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {promptText}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
