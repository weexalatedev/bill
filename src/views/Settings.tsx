'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BatteryCharging,
  Gauge,
  Loader2,
  PlugZap,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import {
  ConnectorApi,
  errorGuidance,
  type Device,
  type DeviceStatusRow,
  type HomeSettings,
} from '../lib/connector';
import { Badge, Card, controlClass } from '../components/ui';
import { cx } from '../lib/cx';
import DevicesTab from '../components/settings/DevicesTab';
import RatePlanTab from '../components/settings/RatePlanTab';
import HardwareTab from '../components/settings/HardwareTab';
import PauseTab from '../components/settings/PauseTab';
import SmartControlTab from '../components/settings/SmartControlTab';
import DeviceDataTab from '../components/settings/DeviceDataTab';

type TabId = 'devices' | 'rate-plan' | 'smart-control' | 'hardware' | 'pause' | 'data';

const TABS: { id: TabId; label: string; icon: typeof PlugZap }[] = [
  { id: 'devices', label: 'Devices', icon: PlugZap },
  { id: 'rate-plan', label: 'Rate Plan', icon: RefreshCw },
  { id: 'smart-control', label: 'Smart Control', icon: SlidersHorizontal },
  { id: 'hardware', label: 'Hardware', icon: BatteryCharging },
  { id: 'pause', label: 'Pause Connections', icon: AlertTriangle },
  { id: 'data', label: 'Live data', icon: Gauge },
];

export default function Settings() {
  const { sites } = useApp();
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = (searchParams.get('tab') ?? 'devices') as TabId;
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : 'devices');
  const [homeId, setHomeId] = useState('');
  const [settings, setSettings] = useState<HomeSettings | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DeviceStatusRow>>({});
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The site id is the connector's `home_id`: the backend never creates homes.
  useEffect(() => {
    if (!homeId && sites.length > 0) setHomeId(sites[0].id);
  }, [sites, homeId]);

  const goToTab = (next: TabId) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const load = useCallback(async () => {
    if (!homeId) return;
    setLoading(true);
    setError(null);
    try {
      const auth = (await getToken()) ?? '';
      if (!auth) throw new Error('Sign in again to load your settings.');
      setToken(auth);
      const [loadedSettings, loadedDevices] = await Promise.all([
        ConnectorApi.getSettings(auth, homeId),
        ConnectorApi.getDevices(auth, homeId),
      ]);
      setSettings(loadedSettings);
      setDevices(loadedDevices);
    } catch (err) {
      setSettings(null);
      setDevices([]);
      setError(errorGuidance(err).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, homeId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** "Refresh status" — the one call that makes real provider requests. */
  const refreshStatuses = useCallback(async () => {
    if (!token || !homeId) return;
    const rows = await ConnectorApi.refreshDevices(token, homeId);
    setStatuses(Object.fromEntries(rows.map((row) => [row.connection_id, row])));
  }, [homeId, token]);

  const octopusConnectionId = useMemo(
    () => devices.find((device) => device.provider === 'octopus')?.connection_id,
    [devices],
  );

  if (sites.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Gauge className="mx-auto h-6 w-6 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-800">Add a site first</p>
        <p className="mt-1 text-sm text-slate-500">
          Devices and settings belong to a site — that site id is the connector&apos;s home id.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Devices, tariffs, hardware and pause switches for the selected site. Everything here is
            stored by the connector service, not in this browser.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Site
            </span>
            <select
              value={homeId}
              onChange={(event) => setHomeId(event.target.value)}
              className={controlClass}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reload
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => goToTab(id)}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              tab === id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        {settings && (
          <span className="ml-auto self-center">
            <Badge tone={settings.pause.effective.sync_active ? 'emerald' : 'amber'}>
              {settings.pause.effective.sync_active ? 'Sync active' : 'Sync paused'}
            </Badge>
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!settings && (loading || !error) ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
        </Card>
      ) : settings ? (
        <>
          {tab === 'devices' && (
            <DevicesTab
              token={token}
              homeId={homeId}
              devices={devices}
              statuses={statuses}
              onReload={load}
              onRefresh={refreshStatuses}
              onOpenRatePlan={() => goToTab('rate-plan')}
            />
          )}
          {tab === 'rate-plan' && (
            <RatePlanTab
              token={token}
              homeId={homeId}
              plan={settings.rate_plan}
              octopusConnectionId={octopusConnectionId}
              onSaved={(plan) => setSettings((prev) => (prev ? { ...prev, rate_plan: plan } : prev))}
            />
          )}
          {tab === 'hardware' && (
            <HardwareTab
              token={token}
              homeId={homeId}
              hardware={settings.hardware}
              onSaved={(hardware) => setSettings((prev) => (prev ? { ...prev, hardware } : prev))}
            />
          )}
          {tab === 'pause' && (
            <PauseTab
              token={token}
              homeId={homeId}
              pause={settings.pause}
              onSaved={(pause) => setSettings((prev) => (prev ? { ...prev, pause } : prev))}
            />
          )}
          {tab === 'smart-control' && <SmartControlTab />}
          {tab === 'data' && <DeviceDataTab token={token} devices={devices} />}
        </>
      ) : null}
    </div>
  );
}
