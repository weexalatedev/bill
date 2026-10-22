/**
 * verify-safety — checks the autonomy safety policy and the dispute letter.
 *
 *   npm run verify:safety
 *
 * Both are deterministic, so this runs offline with no key and no database.
 */

import { checkControlSafety, PROTECTED_ASSET_LABELS } from '../lib/autonomy/policy.js';
import { buildDisputeLetter } from '../lib/dispute.js';
import type { BillAnalysis, BillInput } from '../types.js';

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

function runPolicy(): void {
  console.log('\nAutonomy safety policy');
  const blocked = [
    ['Refrigeration', 'Move the defrost cycle'],
    ['Freezer room', 'Pre-cool overnight'],
    ['Chiller', 'Adjust setpoint'],
    ['Fire alarm panel', 'Silence overnight'],
    ['Emergency lighting', 'Dim after hours'],
    ['Security system', 'Disarm at closing'],
  ];
  for (const [asset, title] of blocked) {
    const v = checkControlSafety({ asset, title });
    check(`blocks automation of "${asset}"`, !v.allowed, JSON.stringify(v));
  }
  const allowed = [
    ['EV fleet', 'Charge overnight'],
    ['Battery', 'Discharge across the peak'],
    ['HVAC', 'Pre-heat before occupancy'],
    ['Lighting', 'Schedule to opening hours'],
  ];
  for (const [asset, title] of allowed) {
    const v = checkControlSafety({ asset, title });
    check(`allows automation of "${asset}"`, v.allowed, JSON.stringify(v));
  }
  check('refuses an action with no asset', !checkControlSafety({}).allowed);
  check('exposes the protected categories', PROTECTED_ASSET_LABELS.length >= 5);
}

const analysis: BillAnalysis = {
  score: 40,
  findings: [
    {
      code: 'total-overstated',
      category: 'pricing',
      severity: 'high',
      title: 'The bill is £162.84 higher than kWh × rate + standing charge',
      detail: 'Itemised charges do not add up to the total.',
      evidence: [{ label: 'Recomputed', value: '£2,722.16' }],
      impactGbp: 162.84,
      confidence: 0.95,
      recommendation: 'Request a corrected invoice.',
      source: 'arithmetic',
    },
    {
      code: 'time-of-use-opportunity',
      category: 'opportunity',
      severity: 'info',
      title: 'A time-of-use tariff could reduce cost',
      detail: 'Modelled opportunity.',
      evidence: [],
      impactGbp: -50,
      confidence: 0.5,
      recommendation: 'Consider a ToU tariff.',
      source: 'tariff-model',
    },
  ],
  recoverableGbp: 162.84,
  periodDays: 28,
  expectedTotalGbp: 2722.16,
  effectiveRateP: 31.36,
  region: { id: 'north-western-england', name: 'North Western England', estimated: false },
  capPeriod: { id: '2026-Q4', label: '1 Oct – 31 Dec 2026', averageUnitRateP: 26.32, electricityVatPct: 0 },
};

const bill: BillInput = {
  supplier: 'British Gas Lite',
  periodStart: '2026-02-01',
  periodEnd: '2026-02-28',
  consumptionKwh: 9200,
  unitRateP: 29.4,
  standingChargeP: 62,
  totalGbp: 2885,
};

function runDispute(): void {
  console.log('\nDispute letter');
  const letter = buildDisputeLetter(analysis, bill, {
    customerName: 'Harbour Hospitality Group',
    siteName: 'Harbour House',
    accountNumber: 'ACC-123',
    mpan: '1234567890123',
  });
  check('has a subject naming the period', letter.subject.includes('2026-02-01'), letter.subject);
  check('addresses the supplier', letter.body.includes('British Gas Lite'));
  check('claims only the positive finding', Math.abs(letter.totalClaimedGbp - 162.84) < 0.01, String(letter.totalClaimedGbp));
  check('does not claim the negative finding', !letter.body.includes('Total amount I am disputing: £112'), '');
  check('lists the disputed charge', letter.body.includes('higher than kWh'));
  check('includes the account number', letter.body.includes('ACC-123'));
  check('includes the MPAN', letter.body.includes('1234567890123'));
  check('sets a 14-day response window', letter.body.includes('14 days'));
  check('mentions the Ombudsman route', letter.body.toLowerCase().includes('ombudsman'));
  check('includes the not-legal-advice note', letter.body.toLowerCase().includes('not as'));
  check('reports the finding count', letter.findingCount === 2, String(letter.findingCount));

  const empty = buildDisputeLetter(
    { ...analysis, findings: [], recoverableGbp: 0 },
    bill,
  );
  check('handles a clean bill without claiming money', empty.totalClaimedGbp === 0);
  check('clean letter still asks for confirmation', empty.body.includes('confirm the items below'));
}

function main(): void {
  console.log('EnerOS safety + dispute verification');
  runPolicy();
  runDispute();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main();
