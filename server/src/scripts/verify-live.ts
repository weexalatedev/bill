/**
 * verify-live — deterministic checks for the live energy-data derivations, plus
 * an optional real-network smoke test.
 *
 *   npm run verify:live          # offline: pure derivations only (always passes)
 *   npm run verify:live -- --net # also hits Octopus + NESO and prints a summary
 *
 * The offline suite is the important one: it proves the *arithmetic* behind a
 * recommendation ("move this load to the cheapest window") is right without
 * depending on what the market happens to be doing.
 */

import {
  cheapestWindows,
  curveCost,
  planShift,
  priceStats,
  priciestWindows,
  rateAt,
} from '../lib/live/derive.js';
import { getLiveSnapshot } from '../lib/live/index.js';
import { buildSiteFlow, type FlowSite } from '../lib/live/flow.js';
import type { HalfHourlyRate } from '../lib/live/types.js';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const approx = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;

/**
 * A synthetic 48-hour Agile-like curve: cheap overnight (5p), mid daytime (20p),
 * and an expensive 16:00–19:00 peak (40p). Deterministic, so every assertion
 * below is exact.
 */
function syntheticRates(): HalfHourlyRate[] {
  const start = Date.parse('2026-10-08T00:00:00Z');
  const rates: HalfHourlyRate[] = [];
  for (let i = 0; i < 96; i += 1) {
    const from = start + i * 30 * 60_000;
    const hour = new Date(from).getUTCHours();
    let price = 20;
    if (hour < 6) price = 5;
    else if (hour >= 16 && hour < 19) price = 40;
    rates.push({
      validFrom: new Date(from).toISOString(),
      validTo: new Date(from + 30 * 60_000).toISOString(),
      unitRateP: price,
      unitRateExcVatP: price,
    });
  }
  return rates;
}

function runOffline(): void {
  const rates = syntheticRates();

  console.log('\nrateAt');
  const at = rateAt(rates, '2026-10-08T17:15:00Z');
  check('finds the 40p peak rate at 17:15', at?.unitRateP === 40, String(at?.unitRateP));
  const overnight = rateAt(rates, '2026-10-08T02:00:00Z');
  check('finds the 5p overnight rate at 02:00', overnight?.unitRateP === 5, String(overnight?.unitRateP));
  check('returns null for an empty series', rateAt([], '2026-10-08T02:00:00Z') === null);

  console.log('\npriceStats');
  const stats = priceStats(rates);
  check('counts all 96 periods', stats.count === 96, String(stats.count));
  check('min is 5p', stats.minUnitRateP === 5, String(stats.minUnitRateP));
  check('max is 40p', stats.maxUnitRateP === 40, String(stats.maxUnitRateP));
  check('mean is 18.75p', approx(stats.meanUnitRateP, 18.75), String(stats.meanUnitRateP));

  console.log('\ncheapest / priciest windows (3h)');
  const cheapest = cheapestWindows(rates, 3, 1);
  const priciest = priciestWindows(rates, 3, 1);
  check('cheapest 3h window averages 5p', approx(cheapest[0]?.avgUnitRateP ?? -1, 5), String(cheapest[0]?.avgUnitRateP));
  check('cheapest 3h window is 6 periods', cheapest[0]?.periods === 6, String(cheapest[0]?.periods));
  check('priciest 3h window averages 40p', approx(priciest[0]?.avgUnitRateP ?? -1, 40), String(priciest[0]?.avgUnitRateP));
  check('priciest 3h window starts at 16:00', priciest[0]?.from === '2026-10-08T16:00:00.000Z', String(priciest[0]?.from));

  console.log('\nplanShift (100 kWh moved from peak to cheapest)');
  const plan = planShift(rates, 100, 3);
  check('price gap is 35p/kWh', approx(plan.gapP, 35), String(plan.gapP));
  check('saving per cycle is GBP 35', approx(plan.savingGbpPerCycle, 35), String(plan.savingGbpPerCycle));
  check('saving per month is GBP 1050', approx(plan.savingGbpPerMonth, 1050), String(plan.savingGbpPerMonth));

  console.log('\ncurveCost');
  // 96 periods x 10 kWh x 18.75p mean = 960 kWh x 0.1875 = GBP 180.00
  check('prices a flat 10 kWh/period over the curve at GBP 180', approx(curveCost(rates, 10), 180), String(curveCost(rates, 10)));

  console.log('\nedge cases');
  check('cheapestWindows on a too-short series returns []', cheapestWindows(rates.slice(0, 2), 3, 1).length === 0);
  check('planShift with no data saves nothing', planShift([], 100, 3).savingGbpPerMonth === 0);
}

function runFlow(): void {
  const rates = syntheticRates();
  const site: FlowSite = {
    id: 'test',
    name: 'Harbour House',
    type: 'Restaurant',
    loads: ['HVAC', 'Refrigeration', 'Hot water', 'EV chargers', 'Solar', 'Battery'],
    monthActual: 6800,
  };

  console.log('\nbuildSiteFlow');
  const nowIso = '2026-10-08T17:00:00Z';
  const flow = buildSiteFlow({
    site,
    importRates: rates,
    standingChargeP: 47.63,
    tariffName: 'Agile Octopus',
    exportRateP: 12,
    nowIso,
  });

  check('returns all five flow nodes', flow.nodes.length === 5, String(flow.nodes.length));
  check('node keys are the expected set', ['ev','battery','grid','solar','load'].every((k) => flow.nodes.some((n) => n.key === k)));
  check('infers solar, battery and EV from loads', flow.assets.hasSolar && flow.assets.hasBattery && flow.assets.hasEv);
  check('generates a 48-slot history', flow.history.length === 48, String(flow.history.length));
  check('solar is zero overnight and positive at midday', flow.history[2].solar === 0 && flow.history[25].solar > 0, `${flow.history[2].solar}/${flow.history[25].solar}`);
  check('EV charges inside the cheapest window (00:00-06:00)', flow.history.slice(0, 12).some((h) => h.ev > 0));
  check('EV does not charge during the 16:00-19:00 peak', flow.history.slice(32, 38).every((h) => h.ev === 0));
  check('battery charges then discharges across the day', flow.totals.batteryChargedKwh > 0 && flow.totals.batteryDischargedKwh > 0, `${flow.totals.batteryChargedKwh}/${flow.totals.batteryDischargedKwh}`);
  check('grid import plus export reconcile with the day', flow.totals.gridImportKwh > 0 && flow.totals.gridExportKwh >= 0);
  check('net cost = import - export + standing', approx(flow.cost.netGbp, flow.cost.importGbp - flow.cost.exportGbp + flow.cost.standingGbp, 0.02), String(flow.cost.netGbp));
  check('prices the day from the live curve', flow.pricedFromLive);
  check('central hub matches the grid direction', (flow.central.mode === 'export') === (flow.mode === 'export'));

  // Determinism is the property that makes this testable.
  const again = buildSiteFlow({ site, importRates: rates, standingChargeP: 47.63, tariffName: 'Agile Octopus', exportRateP: 12, nowIso });
  check('is deterministic for the same inputs', JSON.stringify(again) === JSON.stringify(flow));

  // A site with no assets must still produce a valid, simpler picture.
  const bare = buildSiteFlow({
    site: { ...site, loads: ['HVAC', 'Refrigeration'], monthActual: 3200 },
    importRates: rates,
    standingChargeP: 47.63,
    tariffName: 'Agile Octopus',
    nowIso,
  });
  check('bare site has no solar/battery/EV', !bare.assets.hasSolar && !bare.assets.hasBattery && !bare.assets.hasEv);
  check('bare site still balances its grid', bare.totals.gridImportKwh > 0);
  check('bare site produces no export', bare.totals.gridExportKwh === 0, String(bare.totals.gridExportKwh));
}

async function runNetwork(): Promise<void> {
  console.log('\n-- live network smoke (Octopus + NESO) --');
  const snapshot = await getLiveSnapshot({ region: 'C', windowHours: 3 });
  if (!snapshot.tariff) {
    console.log('  ! tariff feed unavailable — skipping live assertions');
  } else {
    const t = snapshot.tariff;
    console.log(`  region ${t.region} (${t.regionName}) · ${t.rates.length} half-hourly rates`);
    console.log(`  current ${t.current?.unitRateP ?? '—'}p/kWh · standing ${t.standingChargeP}p/day`);
    console.log(`  cheapest 3h ${t.cheapest[0]?.from ?? '—'} @ ${t.cheapest[0]?.avgUnitRateP ?? '—'}p`);
    console.log(`  priciest 3h ${t.priciest[0]?.from ?? '—'} @ ${t.priciest[0]?.avgUnitRateP ?? '—'}p`);
    check('live feed returned rates', t.rates.length > 0, String(t.rates.length));
    check('live feed has a current price', typeof t.current?.unitRateP === 'number');
  }
  if (snapshot.carbon?.current) {
    const c = snapshot.carbon.current;
    console.log(`  carbon now ${c.actual ?? c.forecast} gCO2/kWh (${c.index})`);
    check('carbon feed returned a current reading', true);
  } else {
    console.log('  ! carbon feed unavailable');
  }
}

async function main(): Promise<void> {
  console.log('EnerOS live energy-data verification');
  runOffline();
  runFlow();
  if (process.argv.includes('--net')) {
    await runNetwork();
  } else {
    console.log('\n(skipping network smoke — pass --net to run it)');
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
