'use client';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  ConnectorApi,
  errorGuidance,
  type RatePeriod,
  type RatePlan,
  type RatePlanOut,
} from '../../lib/connector';
import { Badge, Card, Field, SectionHeading, controlClass } from '../ui';

interface Props {
  token: string;
  homeId: string;
  plan: RatePlanOut;
  octopusConnectionId?: string;
  onSaved: (plan: RatePlanOut) => void;
}

const blankPeriod: RatePeriod = { name: 'Day', start: '00:00', end: '24:00', p_per_kwh: 24 };

/** `HH:MM` with `24:00` for end of day, exactly as the backend expects. */
const TIME_HINT = 'HH:MM, 24:00 for end of day';

export default function RatePlanTab({ token, homeId, plan, octopusConnectionId, onSaved }: Props) {
  const [supplier, setSupplier] = useState(plan.supplier ?? '');
  const [standing, setStanding] = useState(String(plan.standing_charge_p_per_day));
  const [exportRate, setExportRate] = useState(String(plan.export_rate_p_per_kwh));
  const [periods, setPeriods] = useState<RatePeriod[]>(plan.import_rates);
  const [coverage, setCoverage] = useState(plan.import_coverage_pct);
  const [source, setSource] = useState(plan.source);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const editPeriod = (index: number, patch: Partial<RatePeriod>) =>
    setPeriods((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const body: RatePlan = {
      supplier: supplier.trim() ? supplier.trim() : null,
      standing_charge_p_per_day: Number(standing) || 0,
      export_rate_p_per_kwh: Number(exportRate) || 0,
      import_rates: periods.map((period) => ({
        name: period.name,
        start: period.start,
        end: period.end,
        p_per_kwh: Number(period.p_per_kwh) || 0,
      })),
      source,
    };
    try {
      const saved = await ConnectorApi.putRatePlan(token, homeId, body);
      setCoverage(saved.import_coverage_pct);
      setSource(saved.source);
      setPeriods(saved.import_rates);
      setNotice('Rate plan saved.');
      onSaved(saved);
    } catch (err) {
      // 422 carries the field message (overlap, bad time, unknown supplier).
      setError(errorGuidance(err).message);
    } finally {
      setSaving(false);
    }
  };

  const fillFromOctopus = async () => {
    if (!octopusConnectionId) return;
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const synced = await ConnectorApi.syncRatePlanFromOctopus(token, homeId, octopusConnectionId);
      setSupplier(synced.supplier ?? '');
      setStanding(String(synced.standing_charge_p_per_day));
      setPeriods(synced.import_rates);
      setCoverage(synced.import_coverage_pct);
      setSource(synced.source);
      setNotice(`${synced.note} (tariff ${synced.tariff_code})`);
      onSaved(synced);
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading title="Rate plan" />
          <p className="mt-1 text-sm text-neutral-500">
            Prices drive every £ figure in Smart Analysis, the Optimiser and the Copilot. Times are
            in the home&apos;s own timezone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={source === 'octopus' ? 'solid' : 'muted'}>
            {source === 'octopus' ? 'From Octopus' : 'Manual'}
          </Badge>
          {octopusConnectionId && (
            <button
              type="button"
              onClick={() => void fillFromOctopus()}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Fill from Octopus
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <p className="flex items-start gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </p>
      )}

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <input
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className={controlClass}
              placeholder="Octopus Energy"
            />
          </Field>
          <Field label="Standing charge (p/day)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={standing}
              onChange={(event) => setStanding(event.target.value)}
              className={controlClass}
            />
          </Field>
          <Field label="Export rate (p/kWh)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={exportRate}
              onChange={(event) => setExportRate(event.target.value)}
              className={controlClass}
            />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Import periods
            </p>
            <span className="text-xs text-neutral-500">
              {coverage.toFixed(1)}% of the day priced
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-ink-900"
              style={{ width: `${Math.min(100, Math.max(0, coverage))}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {periods.length === 0 && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
              No import periods yet — add one so consumption can be priced.
            </p>
          )}
          {periods.map((period, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto]">
              <input
                value={period.name}
                onChange={(event) => editPeriod(index, { name: event.target.value })}
                className={controlClass}
                placeholder="Name"
                aria-label={`Period ${index + 1} name`}
              />
              <input
                value={period.start}
                onChange={(event) => editPeriod(index, { start: event.target.value })}
                className={controlClass}
                placeholder="00:00"
                aria-label={`Period ${index + 1} start`}
                title={TIME_HINT}
              />
              <input
                value={period.end}
                onChange={(event) => editPeriod(index, { end: event.target.value })}
                className={controlClass}
                placeholder="24:00"
                aria-label={`Period ${index + 1} end`}
                title={TIME_HINT}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={period.p_per_kwh}
                onChange={(event) =>
                  editPeriod(index, { p_per_kwh: Number(event.target.value) || 0 })
                }
                className={controlClass}
                aria-label={`Period ${index + 1} pence per kWh`}
              />
              <button
                type="button"
                onClick={() => setPeriods((rows) => rows.filter((_, i) => i !== index))}
                className="grid h-9 w-9 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
                aria-label={`Remove period ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPeriods((rows) => [...rows, { ...blankPeriod }])}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            <Plus className="h-4 w-4" /> Add period
          </button>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save rate plan
        </button>
      </Card>
    </div>
  );
}
