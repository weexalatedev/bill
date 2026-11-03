'use client';
import { useState } from 'react';
import { AlertTriangle, BatteryCharging, CheckCircle2, Home, Loader2 } from 'lucide-react';
import {
  ConnectorApi,
  errorGuidance,
  type HardwareSettings,
  type HardwareSettingsOut,
} from '../../lib/connector';
import { Badge, Card, Field, SectionHeading, controlClass } from '../ui';
import { cx } from '../../lib/cx';

const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'UTC',
];

interface Props {
  token: string;
  homeId: string;
  hardware: HardwareSettingsOut;
  onSaved: (hardware: HardwareSettingsOut) => void;
}

type SubTab = 'home' | 'battery';

export default function HardwareTab({ token, homeId, hardware, onSaved }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('home');
  const [draft, setDraft] = useState<HardwareSettings>({
    timezone: hardware.timezone,
    site_location: hardware.site_location,
    solar_setup: hardware.solar_setup,
    solar_panel_kwp: hardware.solar_panel_kwp,
    battery_units: hardware.battery_units,
    battery_capacity_kwh_per_unit: hardware.battery_capacity_kwh_per_unit,
    battery_source: hardware.battery_source,
  });
  const [batteryTotal, setBatteryTotal] = useState(hardware.battery_total_kwh);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = <K extends keyof HardwareSettings>(key: K, value: HardwareSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await ConnectorApi.putHardware(token, homeId, draft);
      // The backend owns the total: never add units up in the browser.
      setBatteryTotal(saved.battery_total_kwh);
      setDraft({ ...saved });
      setNotice(`Hardware saved — battery total ${saved.battery_total_kwh} kWh.`);
      onSaved(saved);
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (id: SubTab, label: string, Icon: typeof Home) => (
    <button
      type="button"
      onClick={() => setSubTab(id)}
      className={cx(
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
        subTab === id
          ? 'bg-neutral-900 text-white'
          : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading title="Hardware" />
        <p className="mt-1 text-sm text-neutral-500">
          The site location is what the weather lookup and the Ofgem cap region use. Battery totals
          are computed by the connector service.
        </p>
      </div>

      <div className="flex gap-2">
        {tabButton('home', 'Home', Home)}
        {tabButton('battery', 'Battery', BatteryCharging)}
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

      {subTab === 'home' ? (
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" hint="Used for every daily and half-hourly boundary">
              <select
                value={draft.timezone}
                onChange={(event) => set('timezone', event.target.value)}
                className={controlClass}
              >
                {[...new Set([draft.timezone, ...TIMEZONES])].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Site location" hint="Town or postcode — used for the weather lookup">
              <input
                value={draft.site_location}
                onChange={(event) => set('site_location', event.target.value)}
                className={controlClass}
                placeholder="Bristol"
              />
            </Field>
            <Field label="Solar setup" hint="For example “Solis hybrid inverter”">
              <input
                value={draft.solar_setup ?? ''}
                onChange={(event) => set('solar_setup', event.target.value || null)}
                className={controlClass}
                placeholder="None"
              />
            </Field>
            <Field label="Solar panel size (kWp)">
              <input
                type="number"
                step="0.1"
                min="0"
                value={draft.solar_panel_kwp}
                onChange={(event) => set('solar_panel_kwp', Number(event.target.value) || 0)}
                className={controlClass}
              />
            </Field>
          </div>
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-800">Battery</p>
            <Badge tone="muted">Manual details</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Battery units">
              <input
                type="number"
                step="1"
                min="0"
                value={draft.battery_units}
                onChange={(event) => set('battery_units', Number(event.target.value) || 0)}
                className={controlClass}
              />
            </Field>
            <Field label="Capacity per battery (kWh)">
              <input
                type="number"
                step="0.1"
                min="0"
                value={draft.battery_capacity_kwh_per_unit}
                onChange={(event) =>
                  set('battery_capacity_kwh_per_unit', Number(event.target.value) || 0)
                }
                className={controlClass}
              />
            </Field>
          </div>
          <div className="rounded-lg bg-neutral-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Total capacity (from the connector)
            </p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{batteryTotal} kWh</p>
            <p className="mt-1 text-xs text-neutral-500">
              Reading pack size from the Solis inverter is not supported yet, so these details are
              what the app uses.
            </p>
          </div>
        </Card>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save hardware
      </button>
    </div>
  );
}
