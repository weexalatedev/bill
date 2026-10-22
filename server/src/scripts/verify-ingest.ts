/**
 * verify-ingest — CSV parsing + consumption analysis, offline.
 *
 *   npm run verify:ingest
 */

import { parseConsumptionCsv, type ConsumptionPoint } from '../lib/consumption/csv.js';
import { analyseConsumption } from '../lib/consumption/analyse.js';

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

const DAY = 86400000;
const HH = 1800000;

/** Build a long-format CSV of `days` starting at 2026-01-05, GMT (hour == UTC). */
function longCsv(days: number, overnightKwh = 2, dayKwh = 4): string {
  const start = Date.parse('2026-01-05T00:00:00Z');
  const out = ['timestamp,kwh'];
  for (let d = 0; d < days; d += 1) {
    for (let p = 0; p < 48; p += 1) {
      const t = start + d * DAY + p * HH;
      const kwh = p < 12 ? overnightKwh : dayKwh;
      out.push(`${new Date(t).toISOString()},${kwh}`);
    }
  }
  return out.join('\n');
}

function runParser(): void {
  console.log('\nCSV parsing');

  const long = parseConsumptionCsv(longCsv(2));
  check('long: format detected', long.quality.format === 'long', long.quality.format);
  check('long: all rows accepted', long.quality.accepted === 96, String(long.quality.accepted));
  check('long: counts 2 days', long.quality.days === 2, String(long.quality.days));
  check('long: 100% coverage', long.quality.coveragePct === 100, String(long.quality.coveragePct));
  check('long: sorted ascending', long.points[0].from < long.points[long.points.length - 1].from);

  const noHeader = parseConsumptionCsv(
    '2026-01-05T00:00:00Z,3\n2026-01-05T00:30:00Z,4\n',
  );
  check('headerless timestamp,kwh parsed', noHeader.quality.accepted === 2, String(noHeader.quality.accepted));

  const dateTime = parseConsumptionCsv('date,time,kwh\n2026-01-05,00:00,4\n2026-01-05,00:30,5\n');
  check('date,time,kwh parsed', dateTime.quality.accepted === 2, String(dateTime.quality.accepted));

  const wideHeader = ['date', ...Array.from({ length: 48 }, (_, i) => `p${i + 1}`)].join(',');
  const wideRow = ['2026-01-05', ...Array.from({ length: 48 }, () => '3')].join(',');
  const wide = parseConsumptionCsv(`${wideHeader}\n${wideRow}\n`);
  check('wide: format detected', wide.quality.format === 'wide', wide.quality.format);
  check('wide: 48 periods from one row', wide.quality.accepted === 48, String(wide.quality.accepted));

  const dirty = parseConsumptionCsv(
    'timestamp,kwh\n2026-01-05T00:00:00Z,4\nnot-a-date,5\n2026-01-05T00:30:00Z,-2\n2026-01-05T01:00:00Z,abc\n',
  );
  check('bad rows are rejected, not thrown', dirty.quality.rejected >= 2, String(dirty.quality.rejected));
  check('negative reading ignored and counted', dirty.quality.zeroOrNegative >= 1, String(dirty.quality.zeroOrNegative));

  check('empty input is handled', parseConsumptionCsv('').quality.accepted === 0);
  check('unrecognisable input is handled', parseConsumptionCsv('foo,bar,baz\n1,2,3').quality.accepted === 0);
}

function buildPoints(days: number, overnightKwh: number, dayKwh: number): ConsumptionPoint[] {
  const start = Date.parse('2026-01-05T00:00:00Z');
  const out: ConsumptionPoint[] = [];
  for (let d = 0; d < days; d += 1) {
    for (let p = 0; p < 48; p += 1) {
      const t = start + d * DAY + p * HH;
      out.push({ from: new Date(t).toISOString(), kwh: p < 12 ? overnightKwh : dayKwh });
    }
  }
  return out;
}

function runAnalysis(): void {
  console.log('\nConsumption analysis');

  const sevenDays = buildPoints(7, 2, 4);
  const a = analyseConsumption(sevenDays, { meanP: 25 });
  check('computes total kWh', a.totalKwh === 7 * (12 * 2 + 36 * 4), String(a.totalKwh));
  check('counts 7 days', a.days === 7, String(a.days));
  check('load shape has 48 slots', a.loadShape.length === 48, String(a.loadShape.length));
  check('peak kW reflects the busiest half hour', a.peakKw === 8, String(a.peakKw));
  check('overnight share is ~14%', Math.abs(a.overnightSharePct - 14.3) < 0.5, String(a.overnightSharePct));
  check('cost uses the mean price', Math.abs(a.costGbp - (a.totalKwh * 25) / 100) < 0.01, String(a.costGbp));
  check('no baseline with under 14 days', a.baseline === null);

  // 14 days: first 7 heavy, last 7 lighter → a real saving.
  const mixed = [...buildPoints(7, 2, 4)];
  const later = buildPoints(7, 1, 3).map((p) => ({
    ...p,
    from: new Date(Date.parse(p.from) + 7 * DAY).toISOString(),
  }));
  const b = analyseConsumption([...mixed, ...later], { meanP: 25 });
  check('baseline computed with 14 days', b.baseline !== null);
  check('saving is positive when usage falls', (b.baseline?.savedPct ?? 0) > 0, String(b.baseline?.savedPct));
  check('saving is priced in £/month', (b.baseline?.savedGbpPerMonth ?? 0) > 0, String(b.baseline?.savedGbpPerMonth));

  // An anomalous overnight day.
  const withAnomaly = buildPoints(5, 2, 4);
  withAnomaly
    .filter((p) => p.from < '2026-01-06')
    .forEach((p) => {
      if (new Date(p.from).getUTCHours() < 6) p.kwh = 6;
    });
  const c = analyseConsumption(withAnomaly, { meanP: 25 });
  check('flags an anomalous overnight day', c.anomalies.length >= 1, String(c.anomalies.length));
  check('raises an alert for it', c.alerts.length >= 1, String(c.alerts.length));

  check('empty series returns zeros', analyseConsumption([], { meanP: 25 }).totalKwh === 0);
}

function main(): void {
  console.log('EnerOS ingestion verification');
  runParser();
  runAnalysis();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main();
