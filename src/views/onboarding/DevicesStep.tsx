'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, PlugZap, Zap } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { ConnectorApi, errorGuidance, type Device } from '../../lib/connector';
import {
  OctopusConnectModal,
  SolisConnectModal,
} from '../../components/settings/ConnectDeviceModals';

type ProviderKind = 'octopus' | 'solis';

/**
 * Phase 3 — devices. Two integrations are live today: an energy provider
 * (Octopus) and an inverter (Solis). Both are optional; the connector service
 * holds the keys and the browser never sees them.
 */
export default function DevicesStep({
  token,
  homeId,
  onContinue,
  onSkip,
  onCountChange,
}: {
  token: string;
  /** The connector's `home_id` — the first site's id. */
  homeId: string;
  onContinue: () => void;
  onSkip: () => void;
  /** Lets the flow report how many devices ended up connected. */
  onCountChange?: (count: number) => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ProviderKind | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!homeId) {
      setDevices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await ConnectorApi.getDevices(token, homeId);
      setDevices(rows);
      onCountChange?.(rows.length);
    } catch (err) {
      setDevices([]);
      setError(errorGuidance(err).message);
    } finally {
      setLoading(false);
    }
  }, [token, homeId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const octopus = devices.find((device) => device.provider === 'octopus');
  const solis = devices.find((device) => device.provider === 'solis');
  const connected = devices.length;

  // Devices belong to a site; without one there is nothing to attach them to.
  if (!homeId) {
    return (
      <div className="space-y-4">
        <Card className="flex items-start gap-3">
          <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
          <div>
            <p className="text-sm font-semibold text-neutral-800">Add a site first</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              Devices are attached to a site — that site id is the connector&apos;s home. Add one from
              the{' '}
              <Link href="/sites" className="font-semibold text-neutral-700 underline underline-offset-2">
                Sites page
              </Link>{' '}
              and connect devices from Settings when you are ready.
            </p>
          </div>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-600"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banner && (
        <div className="flex items-start gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {error} You can connect devices any time from{' '}
            <Link
              href="/settings?tab=devices"
              className="font-semibold underline underline-offset-2"
            >
              Settings → Devices
            </Link>
            .
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <DeviceCard
          title="Energy provider"
          product="Octopus Energy"
          detail="API key + account number. Unlocks half-hourly usage and your live tariff."
          connected={Boolean(octopus)}
          busy={loading}
          onConnect={() => setModal('octopus')}
        />
        <DeviceCard
          title="Inverter"
          product="Solis"
          detail="API ID + secret from SolisCloud. Brings solar generation and battery data."
          connected={Boolean(solis)}
          busy={loading}
          onConnect={() => setModal('solis')}
        />
      </div>

      <Card className="flex items-start gap-3 bg-neutral-50/70">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
        <p className="text-xs leading-relaxed text-neutral-600">
          Keys are encrypted by the connector service and never reach this browser. More providers —
          gas, EV chargers, batteries — are on the way.
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          {connected > 0 ? 'Continue' : 'Continue without devices'}
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-600"
        >
          Skip for now
        </button>
      </div>

      {modal === 'octopus' && (
        <OctopusConnectModal
          token={token}
          homeId={homeId}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            setBanner('Octopus Energy connected — we can read your usage and tariff.');
            await load();
          }}
        />
      )}

      {modal === 'solis' && (
        <SolisConnectModal
          token={token}
          homeId={homeId}
          onClose={() => setModal(null)}
          onDone={async (stations) => {
            setModal(null);
            setBanner(
              stations === null
                ? 'Solis inverter connected.'
                : `Solis inverter connected — ${stations} station(s) visible.`,
            );
            await load();
          }}
        />
      )}
    </div>
  );
}

function DeviceCard({
  title,
  product,
  detail,
  connected,
  busy,
  onConnect,
}: {
  title: string;
  product: string;
  detail: string;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
            <PlugZap className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-600">{title}</p>
            <p className="text-sm font-semibold text-neutral-900">{product}</p>
          </div>
        </div>
        <Badge tone={connected ? 'solid' : 'muted'}>
          {connected ? 'Connected' : 'Not connected'}
        </Badge>
      </div>
      <p className="text-sm text-neutral-600">{detail}</p>
      <button
        type="button"
        onClick={onConnect}
        disabled={busy}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {connected ? 'Reconnect' : 'Connect'}
      </button>
    </Card>
  );
}
