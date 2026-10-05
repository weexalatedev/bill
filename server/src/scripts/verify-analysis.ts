/**
 * `npm run verify:analysis` — sanity-checks the Smart Analysis engine against
 * hand-built bills whose correct verdict is known.
 *
 * This is not a substitute for a test framework; it exists so the cap table and
 * the checks can be re-validated in one command whenever Ofgem publishes a new
 * quarterly period. Run it before shipping a price-cap refresh.
 */

import { analyseBill } from '../lib/analysis.js';
import { getCapPeriod, regionForPostcode } from '../lib/priceCap.js';
import type { BillInput, Site } from '../types.js';

let failures = 0;
let checks = 0;

function expect(label: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    console.log(`  [32mPASS[0m ${label}`);
  } else {
    failures += 1;
    console.log(`  [31mFAIL[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const codes = (input: BillInput, site?: Site): string[] =>
  analyseBill(input, site).findings.map((f) => f.code);

console.log('\nPrice cap reference data');
const period = getCapPeriod();
expect('cap period is loaded', Boolean(period.id), period.id);
expect('has all 14 GB regions', period.regions.length === 14, `${period.regions.length}`);
expect('regions are price-ordered', period.regions.every((r, i) => i === 0 || r.unitRateP >= period.regions[i - 1].unitRateP));
expect('VAT relief recorded for the current period', period.electricityVatPct === 0);

console.log('\nPostcode → region');
expect('Manchester maps to North West', regionForPostcode('M1 1AA')?.id === 'north-western-england');
expect('London maps to London', regionForPostcode('SW1A 1AA')?.id === 'london');
expect('Edinburgh maps to Southern Scotland', regionForPostcode('EH1 1YZ')?.id === 'southern-scotland');
expect('Inverness maps to Northern Scotland', regionForPostcode('IV1 1AA')?.id === 'northern-scotland');
expect('Cardiff maps to Southern Wales', regionForPostcode('CF10 1EP')?.id === 'southern-wales');
expect('Liverpool maps to Merseyside & N Wales', regionForPostcode('L3 9QQ')?.id === 'merseyside-north-wales');
expect('garbage postcode returns undefined', regionForPostcode('???') === undefined);

console.log('\nEngine checks');
const northWest = { region: 'north-western-england' } as Site;
// 10,000 kWh x 26.49p = £2,649.00 + 45.68p x 30 days = £13.70  →  £2,662.70
const cleanTotal = 2662.7;

expect(
  'clean bill at the cap raises nothing',
  codes(
    {
      consumptionKwh: 10_000,
      unitRateP: 26.49,
      standingChargeP: 45.68,
      totalGbp: cleanTotal,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-30',
    },
    northWest,
  ).length === 0,
);

expect(
  'unit rate above the cap is flagged',
  codes({ consumptionKwh: 10_000, unitRateP: 34, standingChargeP: 45.68 }, northWest).includes('unit-rate-above-cap'),
);

expect(
  'standing charge above the cap is flagged',
  codes({ consumptionKwh: 10_000, unitRateP: 26.49, standingChargeP: 92 }, northWest).includes('standing-charge-above-cap'),
);

expect(
  'arithmetic mismatch is flagged',
  codes({ consumptionKwh: 10_000, unitRateP: 26.49, standingChargeP: 45.68, totalGbp: 3_500 }).includes('total-overstated'),
);

expect(
  'VAT charged during the relief window is flagged',
  codes(
    {
      consumptionKwh: 10_000,
      unitRateP: 26.49,
      standingChargeP: 45.68,
      totalGbp: 2_788.28,
      vatGbp: 139.41,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-30',
    },
    northWest,
  ).includes('vat-removal-not-applied'),
);

expect(
  'business contracts are exempt from the VAT check',
  !codes(
    {
      consumptionKwh: 10_000,
      unitRateP: 18,
      standingChargeP: 45.68,
      totalGbp: 1_941.54,
      vatGbp: 92.45,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-30',
      businessContract: true,
    },
    northWest,
  ).includes('vat-removal-not-applied'),
);

expect(
  'half-hourly threshold fires above 250,000 kWh/yr',
  codes({ consumptionKwh: 300_000, unitRateP: 18, standingChargeP: 30 }, northWest).includes('half-hourly-required'),
);

expect(
  'small sites get a contract-shape note',
  codes({ consumptionKwh: 1_000, unitRateP: 27, standingChargeP: 50 }, { meterType: 'AMR' } as Site).includes('site-too-small-for-contract'),
);

// 5,000 kWh annualises to ~60,000 kWh/yr: above the small-site floor and below
// the half-hourly threshold, so the only finding can come from the TOU model.
const touBill = { consumptionKwh: 5_000, unitRateP: 24, standingChargeP: 40 };
expect(
  'time-of-use modelling only runs when a night share is given',
  codes(touBill, northWest).length === 0 &&
    codes({ ...touBill, nightShare: 0.35 }, northWest).includes('time-of-use-opportunity'),
);

const scored = analyseBill(
  { consumptionKwh: 10_000, unitRateP: 40, standingChargeP: 45.68, totalGbp: 5_000 },
  northWest,
);
expect('a bad bill scores below a clean one', scored.score < 50, `score ${scored.score}`);
expect('recoverable value is positive and itemised', scored.recoverableGbp > 0, `£${scored.recoverableGbp}`);
expect('every finding carries evidence', scored.findings.every((f) => f.evidence.length > 0));
expect('every finding carries a recommendation', scored.findings.every((f) => f.recommendation.length > 20));

console.log(`\n${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);