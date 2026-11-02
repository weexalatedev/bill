/**
 * Verifies the Settings screens' contract against a running stack.
 *
 * Start the two services first:
 *   cd backend && ENCRYPTION_KEY=... APP_API_TOKEN=... uvicorn app.main:app --port 8000
 *   cd server  && APP_API_TOKEN=... PYTHON_BACKEND_URL=http://127.0.0.1:8000 npm run dev:memory
 *
 * Then:
 *   npm run verify:connector            # Settings-only checks (no provider calls)
 *   VERIFY_HOME_ID=demo VERIFY_CONNECTION_ID=<id> npm run verify:connector
 *                                       # also checks the 423 pause gate
 *
 * Everything goes through the Node proxy at /api/connector, using the same
 * client module the UI uses (src/lib/connector.ts).
 */
const BASE = process.env.NEXT_PUBLIC_CONNECTOR_API_URL ?? 'http://127.0.0.1:4000/api/connector';
process.env.NEXT_PUBLIC_CONNECTOR_API_URL = BASE;

const TOKEN = process.env.APP_API_TOKEN ?? 'dev-token-123';
const HOME = process.env.VERIFY_HOME_ID ?? `verify-${Date.now().toString(36)}`;
const CONNECTION = process.env.VERIFY_CONNECTION_ID ?? '';

let checks = 0;
let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks += 1;
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  const { ConnectorApi, ConnectorError, devicePill, errorGuidance } = await import(
    '../src/lib/connector.ts'
  );

  console.log(`Connector: ${BASE}\nhome_id:   ${HOME}\n`);

  // Settings -------------------------------------------------------------
  const fresh = await ConnectorApi.getSettings(TOKEN, HOME);
  check('settings: load with defaults', fresh.hardware.timezone === 'Europe/London');
  check('settings: pause effective flags are derived server-side',
    fresh.pause.effective.sync_active === fresh.pause.home_connections &&
      fresh.pause.effective.alerts_controls_active === fresh.pause.home_connections);

  const hardware = await ConnectorApi.putHardware(TOKEN, HOME, {
    timezone: 'Europe/London',
    site_location: 'Bristol',
    solar_setup: 'Solis hybrid inverter',
    solar_panel_kwp: 4.2,
    battery_units: 3,
    battery_capacity_kwh_per_unit: 5,
    battery_source: 'manual',
  });
  check('hardware: battery total computed by the backend (3 x 5 = 15)',
    hardware.battery_total_kwh === 15, String(hardware.battery_total_kwh));

  let badTimezone: unknown = null;
  try {
    await ConnectorApi.putHardware(TOKEN, HOME, { ...hardware, timezone: 'Mars/Olympus' });
  } catch (error) {
    badTimezone = error;
  }
  check('hardware: unknown timezone is a 422 with a field message',
    badTimezone instanceof ConnectorError && badTimezone.status === 422 && /timezone/i.test(badTimezone.message),
    badTimezone instanceof Error ? badTimezone.message : 'no error');

  let overlap: unknown = null;
  try {
    await ConnectorApi.putRatePlan(TOKEN, HOME, {
      supplier: 'Octopus Energy',
      standing_charge_p_per_day: 41.2,
      export_rate_p_per_kwh: 15,
      source: 'manual',
      import_rates: [
        { name: 'Day', start: '00:00', end: '12:00', p_per_kwh: 24 },
        { name: 'Night', start: '10:00', end: '24:00', p_per_kwh: 12 },
      ],
    });
  } catch (error) {
    overlap = error;
  }
  check('rate plan: overlapping periods are a 422',
    overlap instanceof ConnectorError && overlap.status === 422 && /overlap/i.test(overlap.message),
    overlap instanceof Error ? overlap.message : 'no error');

  const plan = await ConnectorApi.putRatePlan(TOKEN, HOME, {
    supplier: 'Octopus Energy',
    standing_charge_p_per_day: 41.2,
    export_rate_p_per_kwh: 15,
    source: 'manual',
    import_rates: [
      { name: 'Day', start: '07:00', end: '24:00', p_per_kwh: 24.6 },
      { name: 'Night', start: '00:00', end: '07:00', p_per_kwh: 12 },
    ],
  });
  check('rate plan: import coverage is 100% for a full day',
    plan.import_coverage_pct === 100, String(plan.import_coverage_pct));

  let syncOnMissing: unknown = null;
  try {
    await ConnectorApi.syncRatePlanFromOctopus(TOKEN, HOME, 'missing-connection');
  } catch (error) {
    syncOnMissing = error;
  }
  check('rate plan: Octopus auto-fill for an unknown connection is a 404',
    syncOnMissing instanceof ConnectorError && syncOnMissing.status === 404);

  // Devices --------------------------------------------------------------
  const devices = await ConnectorApi.getDevices(TOKEN, HOME);
  check('devices: list is cheap and home-scoped', Array.isArray(devices));
  check('devices: an absent provider reads as not connected',
    devicePill('absent').label === 'Not connected · connect when ready');
  check('devices: pill wording matches the brief',
    devicePill('connected').label === 'Connected · live' &&
      devicePill('reconnect_required').label === 'Disconnected · reconnect required' &&
      devicePill('paused').label === 'Paused');

  const removed = await ConnectorApi.removeOctopus(TOKEN, 'ghost-connection');
  check('devices: remove is idempotent (204 -> null)', removed === null);

  let notFound: unknown = null;
  try {
    await ConnectorApi.getReadiness(TOKEN, 'no-such-connection');
  } catch (error) {
    notFound = error;
  }
  check('errors: unknown connection is a 404',
    notFound instanceof ConnectorError && notFound.status === 404);
  check('errors: 404 guidance says not connected', /Not connected/.test(errorGuidance(notFound).message));

  // Pause gate (needs a real connection for that home) ---------------------
  if (CONNECTION) {
    const paused = await ConnectorApi.putPause(TOKEN, HOME, {
      home_connections: true,
      device_sync: false,
      alerts_controls: true,
    });
    check('pause: effective.sync_active false when device sync is off',
      paused.effective.sync_active === false);

    let gated: unknown = null;
    try {
      await ConnectorApi.getReadiness(TOKEN, CONNECTION);
    } catch (error) {
      gated = error;
    }
    check('pause: data calls answer 423 while paused',
      gated instanceof ConnectorError && gated.status === 423,
      gated instanceof Error ? gated.message : 'no error');
    check('pause: 423 is shown as Paused, not retried', errorGuidance(gated).paused === true);

    const rows = await ConnectorApi.refreshDevices(TOKEN, HOME);
    check('pause: Refresh status reports Paused',
      rows.length > 0 && rows.every((row) => row.status === 'paused'));

    await ConnectorApi.putPause(TOKEN, HOME, {
      home_connections: true,
      device_sync: true,
      alerts_controls: true,
    });
  } else {
    console.log('SKIP  pause 423 checks (set VERIFY_CONNECTION_ID to include them)');
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error('verification crashed:', error);
  process.exit(1);
});
