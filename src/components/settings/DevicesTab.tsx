'use client';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw, Trash2 } from 'lucide-react';
import {
  ConnectorApi,
  errorGuidance,
  type Device,
  type DeviceStatusRow,
} from '../../lib/connector';
import { Badge, Card, SectionHeading } from '../ui';
import { OctopusConnectModal, SolisConnectModal } from './ConnectDeviceModals';

/** Providers this connector service does not cover yet — the app keeps them as before. */
const OTHER_PROVIDERS = ['Axle', 'Daikin', 'myenergi Eddi', 'Ohme'];

const pillTone: Record<DeviceStatusRow['status'], 'solid' | 'outline' | 'muted'> = {
  connected: 'solid',
  reconnect_required: 'outline',
  paused: 'muted',
  error: 'outline',
};

const pillLabel: Record<DeviceStatusRow['status'], string> = {
  connected: 'Connected · live',
  reconnect_required: 'Disconnected · reconnect required',
  paused: 'Paused',
  error: 'Error',
};

type ProviderKind = 'octopus' | 'solis';

interface Props {
  token: string;
  homeId: string;
  devices: Device[];
  statuses: Record<string, DeviceStatusRow>;
  /** Cheap reload: settings + device list, no provider calls. */
  onReload: () => Promise<void>;
  /** The Refresh button: probes every provider. */
  onRefresh: () => Promise<void>;
  onOpenRatePlan: () => void;
}

export default function DevicesTab({
  token,
  homeId,
  devices,
  statuses,
  onReload,
  onRefresh,
  onOpenRatePlan,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ProviderKind | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const octopus = devices.find((device) => device.provider === 'octopus');
  const solis = devices.find((device) => device.provider === 'solis');

  /** "Refresh status" is the only call here that makes real provider requests. */
  const refresh = async () => {
    setRefreshing(true);
    setBanner(null);
    try {
      await onReload();
      await onRefresh();
    } catch (error) {
      setBanner({ tone: 'error', text: errorGuidance(error).message });
    } finally {
      setRefreshing(false);
    }
  };

  const remove = async (device: Device) => {
    setRemoving(device.connection_id);
    setBanner(null);
    try {
      if (device.provider === 'octopus') {
        await ConnectorApi.removeOctopus(token, device.connection_id);
      } else {
        await ConnectorApi.removeSolis(token, device.connection_id);
      }
      setBanner({ tone: 'ok', text: `${device.name} removed.` });
      await onReload();
    } catch (error) {
      setBanner({ tone: 'error', text: errorGuidance(error).message });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading title="Devices" />
          <p className="mt-1 text-sm text-neutral-500">
            Connect a provider once and every dashboard, audit and Copilot answer for this site can
            use its readings. Keys are encrypted by the connector service and never reach this
            browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh status
        </button>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            banner.tone === 'ok'
              ? 'border-neutral-300 bg-neutral-50 text-neutral-800'
              : 'border-neutral-200 bg-neutral-50 text-neutral-800'
          }`}
        >
          {banner.tone === 'ok' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderCard
          title="Octopus Energy"
          subtitle="API key + account number (A-XXXXXXXX)"
          device={octopus}
          status={octopus ? statuses[octopus.connection_id] : undefined}
          removing={removing === octopus?.connection_id}
          onConnect={() => setModal('octopus')}
          onRemove={octopus ? () => void remove(octopus) : undefined}
        />
        <ProviderCard
          title="Solis Inverter"
          subtitle="API ID + API secret"
          device={solis}
          status={solis ? statuses[solis.connection_id] : undefined}
          removing={removing === solis?.connection_id}
          onConnect={() => setModal('solis')}
          onRemove={solis ? () => void remove(solis) : undefined}
        />
      </div>

      <Card className="p-5">
        <p className="text-sm font-semibold text-neutral-800">Not covered by the connector yet</p>
        <p className="mt-1 text-sm text-neutral-500">
          These keep their existing behaviour — the connector service only supplies Octopus and
          Solis.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OTHER_PROVIDERS.map((name) => (
            <Badge key={name} tone="muted">
              {name}
            </Badge>
          ))}
        </div>
      </Card>

      {modal === 'octopus' && (
        <OctopusConnectModal
          token={token}
          homeId={homeId}
          onClose={() => setModal(null)}
          onDone={async (readiness) => {
            setModal(null);
            setBanner({
              tone: 'ok',
              text: readiness ? `Connected. ${readiness.message}` : 'Connected.',
            });
            await onReload();
            await onRefresh();
          }}
          onOpenRatePlan={onOpenRatePlan}
        />
      )}

      {modal === 'solis' && (
        <SolisConnectModal
          token={token}
          homeId={homeId}
          onClose={() => setModal(null)}
          onDone={async (stations) => {
            setModal(null);
            setBanner({
              tone: 'ok',
              text:
                stations === null
                  ? 'Solis inverter connected.'
                  : `Solis inverter connected — ${stations} station(s) visible to the API.`,
            });
            await onReload();
            await onRefresh();
          }}
        />
      )}
    </div>
  );
}

function ProviderCard({
  title,
  subtitle,
  device,
  status,
  removing,
  onConnect,
  onRemove,
}: {
  title: string;
  subtitle: string;
  device?: Device;
  status?: DeviceStatusRow;
  removing: boolean;
  onConnect: () => void;
  onRemove?: () => void;
}) {
  const pill =
    device && status
      ? { label: pillLabel[status.status], tone: pillTone[status.status] }
      : device
        ? { label: 'Connected · press Refresh status', tone: 'muted' as const }
        : null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
            <PlugZap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{title}</p>
            <p className="text-xs text-neutral-500">{subtitle}</p>
          </div>
        </div>
        <Badge tone={pill ? pill.tone : 'muted'}>
          {pill ? pill.label : 'Not connected · connect when ready'}
        </Badge>
      </div>

      {device && status && <p className="text-sm text-neutral-600">{status.message}</p>}

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          {device ? 'Reconnect' : 'Connect'}
        </button>
        {device && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove
          </button>
        )}
      </div>
    </Card>
  );
}
