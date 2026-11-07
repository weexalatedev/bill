'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BatteryCharging,
  Building2,
  Cable,
  Loader2,
  PlugZap,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../store';
import { ConnectorApi, type Device } from '../../lib/connector';
import { Badge, Card, SectionHeading } from '../ui';

/** Providers the connector service speaks today. */
const PROVIDER_COPY: Record<string, { label: string; icon: typeof PlugZap }> = {
  octopus: { label: 'Octopus Energy', icon: PlugZap },
  solis: { label: 'Solis inverter', icon: Sun },
};

/**
 * Devices, per site.
 *
 * The plan treats device connections as the difference between “bill-only” and
 * measured data, so this tab shows what is actually wired up rather than
 * inventing hardware. If the connector service is not running, it says so and
 * points at Settings instead of pretending a device is live.
 */
export default function DevicesPanel() {
  const { sites } = useApp();
  const { getToken } = useAuth();
  const [devices, setDevices] = useState<Record<string, Device[]>>({});
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setOffline(false);
    const token = await getToken();
    if (!token || sites.length === 0) {
      setLoading(false);
      return;
    }
    const next: Record<string, Device[]> = {};
    let reachable = true;
    // One probe per site; a connection-level failure means the whole service is
    // down, so stop after the first and show the banner.
    for (const site of sites) {
      try {
        next[site.id] = await ConnectorApi.getDevices(token, site.id);
      } catch (error) {
        reachable = false;
        next[site.id] = [];
        const status = (error as { status?: number }).status ?? 0;
        if (status === 0 || status >= 500) break;
      }
    }
    setDevices(next);
    setOffline(!reachable);
    setLoading(false);
  }, [getToken, sites]);

  useEffect(() => {
    void load();
  }, [load]);

  const connected = Object.values(devices).flat();
  const sitesWithDevice = Object.values(devices).filter((list) => list.length > 0).length;

  return (
    <div className="space-y-4">
      <Card className="bg-surface">
        <SectionHeading
          title="Devices & connections"
          subtitle="What is wired up today. A device turns a bill-only site into a measured one."
          action={
            <div className="flex items-center gap-2">
              <Badge tone={connected.length > 0 ? 'solid' : 'outline'}>
                {connected.length} device{connected.length === 1 ? '' : 's'} · {sitesWithDevice}/{sites.length} sites
              </Badge>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-900 hover:bg-neutral-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </button>
            </div>
          }
        />

        {offline && (
          <p className="mt-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-700">
            The device service is not reachable right now, so live status cannot be read. Your sites
            and bills are unaffected — connect or repair a device in{' '}
            <Link href="/settings" className="font-semibold text-ink-900 underline">
              Settings → Devices
            </Link>
            .
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {sites.map((site) => {
          const list = devices[site.id] ?? [];
          const quality = site.dataQuality?.consumption ?? 'none';
          return (
            <Card key={site.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <Building2 className="h-4 w-4 shrink-0 text-neutral-600" />
                    <span className="truncate">{site.name}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-700">
                    {site.type} · {site.meterType} meter · synced {site.lastSynced}
                  </p>
                </div>
                <Badge tone={quality === 'hh' ? 'solid' : quality === 'bill-only' ? 'muted' : 'ghost'}>
                  {quality === 'hh' ? 'Half-hourly' : quality === 'bill-only' ? 'Bill only' : 'No data yet'}
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                {list.length === 0 ? (
                  <p className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-700">
                    <Cable className="h-3.5 w-3.5" /> No provider connected for this site.
                    <Link href="/settings" className="ml-auto inline-flex items-center gap-1 font-semibold text-ink-900 hover:underline">
                      Connect <ArrowRight className="h-3 w-3" />
                    </Link>
                  </p>
                ) : (
                  list.map((device) => {
                    const copy = PROVIDER_COPY[device.provider] ?? { label: device.provider, icon: PlugZap };
                    const Icon = copy.icon;
                    return (
                      <div
                        key={device.connection_id}
                        className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-neutral-700" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-900">
                          {device.name || copy.label}
                        </span>
                        <Badge tone="solid">Connected</Badge>
                      </div>
                    );
                  })
                )}
              </div>

              {site.loads.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] tracking-wide text-neutral-600">Loads</span>
                  {site.loads.slice(0, 6).map((load) => (
                    <Badge key={load} tone="muted">
                      {load}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="bg-neutral-50/70">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <BatteryCharging className="h-4 w-4" /> What a device unlocks
        </p>
        <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-neutral-700 sm:grid-cols-2">
          <li>• Half-hourly consumption: real kW at 17:30, not spend divided by days.</li>
          <li>• Live tariff sync: the rate on the bill is the rate we expect.</li>
          <li>• Flexibility: shift EV charging or heating into the cheap window.</li>
          <li>• Verification: a baseline that can be measured, not asserted.</li>
        </ul>
      </Card>
    </div>
  );
}
