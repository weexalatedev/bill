import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import {
  BatteryCharging,
  PlugZap,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react-native';

import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import {
  ConnectorApi,
  errorGuidance,
  type Device,
  type DeviceStatusRow,
  type HardwareSettings,
  type HomeSettings,
  type PauseSettings,
  type RatePeriod,
} from '../lib/connector';
import { Badge, Button, Card, Chips, Field, SectionHeading, Segmented } from '../components/ui';
import { Screen, ScreenHeader } from '../components/Layout';
import { colors, font, fontWeight, radius, spacing } from '../theme';

type Tab = 'Devices' | 'Rate plan' | 'Hardware' | 'Pause';

/** Draft state for the rate-plan form (strings so the inputs stay editable). */
interface PastedPlan {
  supplier: string;
  standing: string;
  exportRate: string;
  periods: RatePeriod[];
}
const TABS: Tab[] = ['Devices', 'Rate plan', 'Hardware', 'Pause'];

const pillLabel: Record<DeviceStatusRow['status'], string> = {
  connected: 'Connected · live',
  reconnect_required: 'Disconnected · reconnect required',
  paused: 'Paused',
  error: 'Error',
};

const pillTone: Record<DeviceStatusRow['status'], 'emerald' | 'amber' | 'rose'> = {
  connected: 'emerald',
  reconnect_required: 'rose',
  paused: 'amber',
  error: 'rose',
};

export default function SettingsScreen() {
  const { sites } = useApp();
  const { getToken } = useAuth();

  const [tab, setTab] = useState<Tab>('Devices');
  const [siteId, setSiteId] = useState('');
  const [token, setToken] = useState('');
  const [settings, setSettings] = useState<HomeSettings | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DeviceStatusRow>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId && sites.length > 0) setSiteId(sites[0].id);
  }, [siteId, sites]);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const auth = (await getToken()) ?? '';
      if (!auth) throw new Error('Sign in again to load your settings.');
      setToken(auth);
      const [nextSettings, nextDevices] = await Promise.all([
        ConnectorApi.getSettings(auth, siteId),
        ConnectorApi.getDevices(auth, siteId),
      ]);
      setSettings(nextSettings);
      setDevices(nextDevices);
    } catch (err) {
      setSettings(null);
      setDevices([]);
      setError(errorGuidance(err).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Refresh status is the only call that makes real provider requests. */
  const refreshStatuses = async () => {
    setBusy(true);
    setError(null);
    try {
      const rows = await ConnectorApi.refreshDevices(token, siteId);
      setStatuses(Object.fromEntries(rows.map((row) => [row.connection_id, row])));
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (device: Device) => {
    setBusy(true);
    setError(null);
    try {
      if (device.provider === 'octopus') await ConnectorApi.removeOctopus(token, device.connection_id);
      else await ConnectorApi.removeSolis(token, device.connection_id);
      setNotice(`${device.name} removed.`);
      await load();
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  /** Octopus connect: prove the data is usable, then fill the tariff. */
  const connectOctopus = async (apiKey: string, accountNumber: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await ConnectorApi.connectOctopus(token, {
        api_key: apiKey.trim(),
        account_number: accountNumber.trim().toUpperCase(),
        home_id: siteId,
      });
      let text = 'Octopus Energy connected.';
      try {
        const readiness = await ConnectorApi.getReadiness(token, created.connection_id);
        text = `Connected. ${readiness.message}`;
      } catch {
        /* readiness is best-effort */
      }
      try {
        const synced = await ConnectorApi.syncRatePlanFromOctopus(token, siteId, created.connection_id);
        text = `${text} Rate plan: ${synced.note}`;
      } catch (syncError) {
        text = `${text} Rate plan: ${errorGuidance(syncError).message}`;
      }
      setNotice(text);
      await load();
      await refreshStatuses();
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  const connectSolis = async (apiId: string, apiSecret: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await ConnectorApi.connectSolis(token, {
        api_id: apiId.trim(),
        api_secret: apiSecret.trim(),
        home_id: siteId,
      });
      setNotice(
        created.stations_total === null
          ? 'Solis inverter connected.'
          : `Solis inverter connected — ${created.stations_total} station(s) visible.`,
      );
      await load();
      await refreshStatuses();
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  const saveHardware = async (body: HardwareSettings) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await ConnectorApi.putHardware(token, siteId, body);
      setSettings((prev) => (prev ? { ...prev, hardware: saved } : prev));
      setNotice(`Hardware saved — battery total ${saved.battery_total_kwh} kWh.`);
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  const saveRatePlan = async (body: PastedPlan) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await ConnectorApi.putRatePlan(token, siteId, {
        supplier: body.supplier.trim() ? body.supplier.trim() : null,
        standing_charge_p_per_day: Number(body.standing) || 0,
        export_rate_p_per_kwh: Number(body.exportRate) || 0,
        import_rates: body.periods,
        source: 'manual',
      });
      setSettings((prev) => (prev ? { ...prev, rate_plan: saved } : prev));
      setNotice('Rate plan saved.');
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  const setPause = async (next: PauseSettings) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await ConnectorApi.putPause(token, siteId, next);
      setSettings((prev) => (prev ? { ...prev, pause: saved } : prev));
      setNotice(saved.effective.sync_active ? 'Connections resumed.' : 'Connections paused.');
    } catch (err) {
      setError(errorGuidance(err).message);
    } finally {
      setBusy(false);
    }
  };

  const octopusConnectionId = devices.find((device) => device.provider === 'octopus')?.connection_id;

  return (
    <>
      <ScreenHeader title="Settings" subtitle="Devices & tariffs · connector service" Icon={SettingsIcon} />
      <Screen>
        <Chips
          options={sites.map((site) => site.id)}
          value={siteId}
          onChange={setSiteId}
          labels={Object.fromEntries(sites.map((site) => [site.id, site.name]))}
        />

        <Segmented options={TABS} value={tab} onChange={setTab} />

        {loading ? (
          <Card>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.emerald500} />
              <Text style={styles.muted}>Loading settings…</Text>
            </View>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}
        {notice ? (
          <Card>
            <Text style={styles.noticeText}>{notice}</Text>
          </Card>
        ) : null}

        {tab === 'Devices' && (
          <>
            <View style={styles.rowBetween}>
              <SectionHeading title="Devices" />
              <Button
                label={busy ? 'Refreshing…' : 'Refresh status'}
                variant="secondary"
                size="sm"
                Icon={RefreshCw}
                onPress={() => void refreshStatuses()}
                disabled={busy}
              />
            </View>

            <ProviderRow
              name="Octopus Energy"
              device={devices.find((device) => device.provider === 'octopus')}
              status={statuses[devices.find((d) => d.provider === 'octopus')?.connection_id ?? '']}
              onRemove={removeDevice}
              busy={busy}
            />
            <ProviderRow
              name="Solis Inverter"
              device={devices.find((device) => device.provider === 'solis')}
              status={statuses[devices.find((d) => d.provider === 'solis')?.connection_id ?? '']}
              onRemove={removeDevice}
              busy={busy}
            />

            <OctopusForm busy={busy} onConnect={connectOctopus} />
            <SolisForm busy={busy} onConnect={connectSolis} />

            <Card>
              <Text style={styles.cardTitle}>Not covered by the connector yet</Text>
              <Text style={styles.muted}>
                Axle, Daikin, myenergi Eddi and Ohme keep their existing behaviour in the app.
              </Text>
            </Card>
          </>
        )}

        {tab === 'Rate plan' && settings && (
          <RatePlanSection
            plan={settings.rate_plan}
            busy={busy}
            canSync={Boolean(octopusConnectionId)}
            onSave={saveRatePlan}
            onSync={async () => {
              if (!octopusConnectionId) return;
              setBusy(true);
              setError(null);
              try {
                const synced = await ConnectorApi.syncRatePlanFromOctopus(
                  token,
                  siteId,
                  octopusConnectionId,
                );
                setSettings((prev) => (prev ? { ...prev, rate_plan: synced } : prev));
                setNotice(`${synced.note} (tariff ${synced.tariff_code})`);
              } catch (err) {
                setError(errorGuidance(err).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}

        {tab === 'Hardware' && settings && (
          <HardwareSection hardware={settings.hardware} busy={busy} onSave={saveHardware} />
        )}

        {tab === 'Pause' && settings && (
          <PauseSection pause={settings.pause} busy={busy} onChange={setPause} />
        )}

        {!settings && !loading && sites.length === 0 ? (
          <Card>
            <Text style={styles.cardTitle}>Add a site first</Text>
            <Text style={styles.muted}>
              Devices and settings belong to a site — that site id is the connector&apos;s home id.
            </Text>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

/* ------------------------------------------------------------- sub-components */

function ProviderRow({
  name,
  device,
  status,
  onRemove,
  busy,
}: {
  name: string;
  device?: Device;
  status?: DeviceStatusRow;
  onRemove: (device: Device) => Promise<void>;
  busy: boolean;
}) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        <View style={styles.providerName}>
          <PlugZap size={16} color={colors.emerald600} strokeWidth={2.2} />
          <Text style={styles.cardTitle}>{name}</Text>
        </View>
        <Badge tone={status ? pillTone[status.status] : 'slate'}>
          {status ? pillLabel[status.status] : device ? 'Connected' : 'Not connected'}
        </Badge>
      </View>
      {device && status ? <Text style={styles.muted}>{status.message}</Text> : null}
      {device ? (
        <Button
          label={busy ? 'Removing…' : 'Remove'}
          variant="secondary"
          size="sm"
          Icon={Trash2}
          onPress={() => void onRemove(device)}
          disabled={busy}
        />
      ) : null}
    </Card>
  );
}

function OctopusForm({
  busy,
  onConnect,
}: {
  busy: boolean;
  onConnect: (apiKey: string, accountNumber: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  return (
    <Card>
      <SectionHeading title="Connect Octopus Energy" />
      <Text style={styles.muted}>API key + account number (A-XXXXXXXX). Encrypted by the connector.</Text>
      <View style={styles.fieldRow}>
        <Field label="API key" value={apiKey} onChangeText={setApiKey} placeholder="sk_live_…" />
      </View>
      <View style={styles.fieldRow}>
        <Field
          label="Account number"
          value={accountNumber}
          onChangeText={setAccountNumber}
          placeholder="A-1A2B3C4D"
        />
      </View>
      <Button
        label={busy ? 'Connecting…' : 'Connect Device'}
        onPress={() => void onConnect(apiKey, accountNumber)}
        disabled={busy || apiKey.trim().length < 8 || accountNumber.trim().length < 8}
      />
    </Card>
  );
}

function SolisForm({
  busy,
  onConnect,
}: {
  busy: boolean;
  onConnect: (apiId: string, apiSecret: string) => Promise<void>;
}) {
  const [apiId, setApiId] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  return (
    <Card>
      <SectionHeading title="Connect Solis inverter" />
      <Text style={styles.muted}>SolisCloud → Account → Basic Settings → API Management.</Text>
      <View style={styles.fieldRow}>
        <Field label="API ID" value={apiId} onChangeText={setApiId} />
      </View>
      <View style={styles.fieldRow}>
        <Field label="API secret" value={apiSecret} onChangeText={setApiSecret} />
      </View>
      <Button
        label={busy ? 'Connecting…' : 'Connect Device'}
        variant="secondary"
        onPress={() => void onConnect(apiId, apiSecret)}
        disabled={busy || apiId.trim().length < 6 || apiSecret.trim().length < 4}
      />
    </Card>
  );
}

function RatePlanSection({
  plan,
  busy,
  canSync,
  onSave,
  onSync,
}: {
  plan: HomeSettings['rate_plan'];
  busy: boolean;
  canSync: boolean;
  onSave: (draft: PastedPlan) => Promise<void>;
  onSync: () => Promise<void>;
}) {
  const [supplier, setSupplier] = useState(plan.supplier ?? '');
  const [standing, setStanding] = useState(String(plan.standing_charge_p_per_day));
  const [exportRate, setExportRate] = useState(String(plan.export_rate_p_per_kwh));

  return (
    <Card>
      <View style={styles.rowBetween}>
        <SectionHeading title="Rate plan" />
        <Badge tone={plan.source === 'octopus' ? 'sky' : 'slate'}>
          {plan.source === 'octopus' ? 'From Octopus' : 'Manual'}
        </Badge>
      </View>
      <Text style={styles.muted}>
        {plan.import_coverage_pct.toFixed(1)}% of the day priced across {plan.import_rates.length}{' '}
        period(s). Times are the home&apos;s local time.
      </Text>
      <View style={styles.fieldRow}>
        <Field label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Octopus Energy" />
      </View>
      <View style={styles.fieldRow}>
        <Field label="Standing charge (p/day)" value={standing} onChangeText={setStanding} keyboardType="numeric" />
        <Field label="Export rate (p/kWh)" value={exportRate} onChangeText={setExportRate} keyboardType="numeric" />
      </View>
      <Button
        label={busy ? 'Saving…' : 'Save rate plan'}
        onPress={() => void onSave({ supplier, standing, exportRate, periods: plan.import_rates })}
        disabled={busy}
      />
      {canSync ? (
        <Button
          label="Fill from Octopus"
          variant="secondary"
          size="sm"
          Icon={RefreshCw}
          onPress={() => void onSync()}
          disabled={busy}
        />
      ) : (
        <Text style={styles.muted}>Connect Octopus on the Devices tab to fill these prices automatically.</Text>
      )}
    </Card>
  );
}

function HardwareSection({
  hardware,
  busy,
  onSave,
}: {
  hardware: HomeSettings['hardware'];
  busy: boolean;
  onSave: (body: HardwareSettings) => Promise<void>;
}) {
  const [timezone, setTimezone] = useState(hardware.timezone);
  const [location, setLocation] = useState(hardware.site_location);
  const [units, setUnits] = useState(String(hardware.battery_units));
  const [perUnit, setPerUnit] = useState(String(hardware.battery_capacity_kwh_per_unit));
  const zones = ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'UTC'];

  return (
    <Card>
      <SectionHeading title="Hardware" />
      <Text style={styles.muted}>
        Battery total {hardware.battery_total_kwh} kWh, computed by the connector service.
      </Text>
      <Chips options={zones} value={timezone} onChange={setTimezone} />
      <View style={styles.fieldRow}>
        <Field label="Site location" value={location} onChangeText={setLocation} placeholder="Bristol" />
      </View>
      <View style={styles.fieldRow}>
        <Field label="Battery units" value={units} onChangeText={setUnits} keyboardType="numeric" />
        <Field
          label="Capacity per battery (kWh)"
          value={perUnit}
          onChangeText={setPerUnit}
          keyboardType="numeric"
        />
      </View>
      <Button
        label={busy ? 'Saving…' : 'Save hardware'}
        Icon={BatteryCharging}
        onPress={() =>
          void onSave({
            timezone,
            site_location: location,
            solar_setup: hardware.solar_setup,
            solar_panel_kwp: hardware.solar_panel_kwp,
            battery_units: Number(units) || 0,
            battery_capacity_kwh_per_unit: Number(perUnit) || 0,
            battery_source: 'manual',
          })
        }
        disabled={busy}
      />
    </Card>
  );
}

function PauseSection({
  pause,
  busy,
  onChange,
}: {
  pause: HomeSettings['pause'];
  busy: boolean;
  onChange: (next: PauseSettings) => Promise<void>;
}) {
  const rows: { key: keyof PauseSettings; title: string; hint: string }[] = [
    {
      key: 'home_connections',
      title: 'Home connections',
      hint: 'Master switch: off pauses device sync and alerts and controls too.',
    },
    { key: 'device_sync', title: 'Device sync', hint: 'Paused homes answer data calls with 423.' },
    { key: 'alerts_controls', title: 'Alerts and controls', hint: 'Stored here, enforced by the app.' },
  ];

  return (
    <>
      <Card>
        <SectionHeading title="Pause connections" />
        {rows.map((row) => (
          <View key={row.key} style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.cardTitle}>{row.title}</Text>
              <Text style={styles.muted}>{row.hint}</Text>
            </View>
            <Switch
              value={pause[row.key]}
              disabled={busy}
              onValueChange={(value) =>
                void onChange({
                  home_connections: pause.home_connections,
                  device_sync: pause.device_sync,
                  alerts_controls: pause.alerts_controls,
                  [row.key]: value,
                })
              }
            />
          </View>
        ))}
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Device sync</Text>
          <Badge tone={pause.effective.sync_active ? 'emerald' : 'amber'}>
            {pause.effective.sync_active ? 'Active' : 'Paused'}
          </Badge>
        </View>
        <Text style={styles.muted}>From effective.sync_active — not the raw toggles.</Text>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Alerts and controls</Text>
          <Badge tone={pause.effective.alerts_controls_active ? 'emerald' : 'amber'}>
            {pause.effective.alerts_controls_active ? 'Active' : 'Paused'}
          </Badge>
        </View>
        <Text style={styles.muted}>
          From effective.alerts_controls_active. Turning home connections off pauses both cards.
        </Text>
      </Card>
    </>
  );
}

const styles = {
  loadingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  rowBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing.sm,
  },
  providerName: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  cardTitle: { fontSize: font.md, fontWeight: fontWeight.semibold as '600', color: colors.slate800 },
  muted: { fontSize: font.sm, color: colors.slate500, lineHeight: 19 },
  errorText: { fontSize: font.sm, color: colors.rose700, fontWeight: fontWeight.semibold as '600' },
  noticeText: { fontSize: font.sm, color: colors.emerald700, fontWeight: fontWeight.semibold as '600' },
  fieldRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
    borderRadius: radius.sm,
  },
  switchText: { flex: 1, gap: 2 },
};
