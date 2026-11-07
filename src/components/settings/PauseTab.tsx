'use client';
import { useState } from 'react';
import { AlertTriangle, Bell, Loader2, PauseCircle, RefreshCw } from 'lucide-react';
import {
  ConnectorApi,
  errorGuidance,
  type PauseOut,
  type PauseSettings,
} from '../../lib/connector';
import { Badge, Card, SectionHeading } from '../ui';
import { cx } from '../../lib/cx';

interface Props {
  token: string;
  homeId: string;
  pause: PauseOut;
  onSaved: (pause: PauseOut) => void;
}

const ROWS: { key: keyof PauseSettings; title: string; hint: string }[] = [
  {
    key: 'home_connections',
    title: 'Home connections',
    hint: 'Master switch. Turning this off pauses device sync and alerts and controls too.',
  },
  {
    key: 'device_sync',
    title: 'Device sync',
    hint: 'Paused homes answer data calls with “Paused” (HTTP 423) and the app does not retry.',
  },
  {
    key: 'alerts_controls',
    title: 'Alerts and controls',
    hint: 'The connector stores this flag; the app enforces it before sending any alert or control.',
  },
];

export default function PauseTab({ token, homeId, pause, onSaved }: Props) {
  const [state, setState] = useState<PauseOut>(pause);
  const [busy, setBusy] = useState<keyof PauseSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = async (key: keyof PauseSettings) => {
    const next: PauseSettings = {
      home_connections: state.home_connections,
      device_sync: state.device_sync,
      alerts_controls: state.alerts_controls,
      [key]: !state[key],
    };
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const saved = await ConnectorApi.putPause(token, homeId, next);
      setState(saved);
      setNotice(saved.effective.sync_active ? 'Connections resumed.' : 'Connections paused.');
      onSaved(saved);
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading title="Pause connections" />
        <p className="mt-1 text-sm text-neutral-600">
          Pausing is immediate and reversible: the switch is stored by the connector, so every
          caller sees the same state.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {notice}
        </p>
      )}

      <Card className="divide-y divide-neutral-100 p-0">
        {ROWS.map((row) => {
          const on = state[row.key];
          return (
            <div key={row.key} className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{row.title}</p>
                <p className="mt-0.5 text-xs text-neutral-600">{row.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={row.title}
                onClick={() => void toggle(row.key)}
                disabled={busy !== null}
                className={cx(
                  'relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
                  on ? 'bg-neutral-900' : 'bg-neutral-300',
                )}
              >
                <span
                  className={cx(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                    on ? 'left-[22px]' : 'left-0.5',
                  )}
                />
                {busy === row.key && (
                  <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                )}
              </button>
            </div>
          );
        })}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <RefreshCw className="h-4 w-4 text-neutral-600" /> Device sync
            </p>
            <Badge tone={state.effective.sync_active ? 'solid' : 'outline'}>
              {state.effective.sync_active ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Taken from the server&apos;s <code>effective.sync_active</code>, not the raw toggles.
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <Bell className="h-4 w-4 text-neutral-600" /> Alerts and controls
            </p>
            <Badge tone={state.effective.alerts_controls_active ? 'solid' : 'outline'}>
              {state.effective.alerts_controls_active ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Taken from <code>effective.alerts_controls_active</code>. Turning home connections off
            pauses both cards.
          </p>
        </Card>
      </div>

      {!state.effective.sync_active && (
        <p className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Device sync is paused, so dashboards, the Optimiser and the Copilot show “Paused” until
            you switch it back on.
          </span>
        </p>
      )}
    </div>
  );
}
