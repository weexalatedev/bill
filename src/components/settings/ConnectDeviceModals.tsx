'use client';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { ConnectorApi, errorGuidance, type Readiness } from '../../lib/connector';
import { Field, Modal, controlClass } from '../ui';

/**
 * The two provider connect forms, shared by the Settings → Devices tab and the
 * onboarding device step. Kept in one place so the credential fields, the
 * post-connect readiness probe and the Octopus rate-plan sync never drift apart.
 */

export function OctopusConnectModal({
  token,
  homeId,
  onClose,
  onDone,
  /** Optional: only the Settings tab has a Rate Plan tab to jump to. */
  onOpenRatePlan,
}: {
  token: string;
  homeId: string;
  onClose: () => void;
  onDone: (readiness: Readiness | null) => Promise<void>;
  onOpenRatePlan?: () => void;
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
          className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
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

        {error && <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{error}</p>}
        {ratePlanNote && (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
            Rate plan: {ratePlanNote}{' '}
            {onOpenRatePlan && (
              <button
                type="button"
                onClick={onOpenRatePlan}
                className="font-semibold underline underline-offset-2"
              >
                Open Rate Plan
              </button>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Connect Device
        </button>
      </form>
    </Modal>
  );
}

export function SolisConnectModal({
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
          className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
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

        {error && <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Connect Device
        </button>
      </form>
    </Modal>
  );
}
