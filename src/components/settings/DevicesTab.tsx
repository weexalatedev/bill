'use client';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw, Trash2 } from 'lucide-react';
import {
  ConnectorApi,
  errorGuidance,
  type Device,
  type DeviceStatusRow,
  type Readiness,
} from '../../lib/connector';
import { Badge, Card, Field, Modal, SectionHeading, controlClass } from '../ui';

/** Providers this connector service does not cover yet — the app keeps them as before. */
const OTHER_PROVIDERS = ['Axle', 'Daikin', 'myenergi Eddi', 'Ohme'];

const pillTone: Record<DeviceStatusRow['status'], 'emerald' | 'amber' | 'rose'> = {
  connected: 'emerald',
  reconnect_required: 'rose',
  paused: 'amber',
  error: 'rose',
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
          <p className="mt-1 text-sm text-slate-500">
            Connect a provider once and every dashboard, audit and Copilot answer for this site can
            use its readings. Keys are encrypted by the connector service and never reach this
            browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh status
        </button>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            banner.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
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
        <p className="text-sm font-semibold text-slate-800">Not covered by the connector yet</p>
        <p className="mt-1 text-sm text-slate-500">
          These keep their existing behaviour — the connector service only supplies Octopus and
          Solis.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OTHER_PROVIDERS.map((name) => (
            <Badge key={name} tone="slate">
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
        ? { label: 'Connected · press Refresh status', tone: 'slate' as const }
        : null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <PlugZap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <Badge tone={pill ? pill.tone : 'slate'}>
          {pill ? pill.label : 'Not connected · connect when ready'}
        </Badge>
      </div>

      {device && status && <p className="text-sm text-slate-600">{status.message}</p>}

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          {device ? 'Reconnect' : 'Connect'}
        </button>
        {device && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove
          </button>
        )}
      </div>
    </Card>
  );
}

function OctopusConnectModal({
  token,
  homeId,
  onClose,
  onDone,
  onOpenRatePlan,
}: {
  token: string;
  homeId: string;
  onClose: () => void;
  onDone: (readiness: Readiness | null) => Promise<void>;
  onOpenRatePlan: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratePlanNote, setRatePlanNote] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await ConnectorApi.connectOctopus(token, {
        api_key: apiKey.trim(),
        account_number: accountNumber.trim().toUpperCase(),
        home_id: homeId,
      });

      // Right after connecting: prove the data is usable, then fill the tariff.
      let readiness: Readiness | null = null;
      try {
        readiness = await ConnectorApi.getReadiness(token, created.connection_id);
      } catch {
        readiness = null;
      }
      try {
        const synced = await ConnectorApi.syncRatePlanFromOctopus(
          token,
          homeId,
          created.connection_id,
        );
        setRatePlanNote(synced.note);
      } catch (syncError) {
        // A multi-rate tariff answers 422: show it, the customer types rates manually.
        setRatePlanNote(errorGuidance(syncError).message);
      }
      await onDone(readiness);
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Connect Octopus Energy"
      description="Paste the API key from your Octopus account. The connector service encrypts it."
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field label="API key" hint="octopus.energy → Account → Personal details → API access">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className={controlClass}
            placeholder="sk_live_..."
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Account number" hint="Eight characters, for example A-1A2B3C4D">
          <input
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            className={controlClass}
            placeholder="A-1A2B3C4D"
            autoComplete="off"
            required
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {ratePlanNote && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Rate plan: {ratePlanNote}{' '}
            <button
              type="button"
              onClick={onOpenRatePlan}
              className="font-semibold underline underline-offset-2"
            >
              Open Rate Plan
            </button>
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Connect Device
        </button>
      </form>
    </Modal>
  );
}

function SolisConnectModal({
  token,
  homeId,
  onClose,
  onDone,
}: {
  token: string;
  homeId: string;
  onClose: () => void;
  onDone: (stations: number | null) => Promise<void>;
}) {
  const [apiId, setApiId] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await ConnectorApi.connectSolis(token, {
        api_id: apiId.trim(),
        api_secret: apiSecret.trim(),
        home_id: homeId,
      });
      await onDone(created.stations_total ?? null);
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Connect Solis inverter"
      description="SolisCloud → Account → Basic Settings → API Management gives you the ID and secret."
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field label="API ID">
          <input
            value={apiId}
            onChange={(event) => setApiId(event.target.value)}
            className={controlClass}
            autoComplete="off"
            required
          />
        </Field>
        <Field label="API secret">
          <input
            type="password"
            value={apiSecret}
            onChange={(event) => setApiSecret(event.target.value)}
            className={controlClass}
            autoComplete="off"
            required
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Connect Device
        </button>
      </form>
    </Modal>
  );
}
