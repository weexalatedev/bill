/**
 * verify-copilot — deterministic checks for the grounded Copilot.
 *
 *   npm run verify:copilot
 *
 * Stubs `fetch` so the Gemini request/response handling and the grounded-context
 * builder can be tested offline. No API key and no network required.
 */

// Must be set before the modules read env.
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MODEL = 'test-model';

const { answerCopilot, buildCopilotContext } = await import('../lib/copilot.js');
import type { Workspace } from '../services/catalog.js';

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

const workspace = {
  account: {
    name: 'Harbour Hospitality Group',
    planId: 'optimise',
    sites: 12,
    contractStart: '2025-04-01',
    performanceFeePct: 15,
    flexibilitySharePct: 25,
  },
  sites: [
    {
      id: 's1',
      name: 'Harbour House',
      city: 'Manchester',
      region: 'north-western-england',
      type: 'Restaurant',
      annualSpend: 195000,
      monthActual: 8120,
      monthExpected: 9200,
      meterType: 'Half-hourly',
      status: 'Watch',
      loads: ['HVAC', 'Refrigeration', 'Kitchen'],
      lastSynced: '2026-03-01T00:00:00.000Z',
    },
  ],
  invoices: [
    {
      id: 'INV-1',
      siteId: 's1',
      supplier: 'British Gas Lite',
      period: 'Feb 2026',
      consumptionKwh: 32000,
      unitRateP: 26.4,
      standingChargeP: 52,
      total: 8900,
      status: 'Flagged',
      issues: [{ type: 'Tariff discrepancy', detail: 'Above contract', impact: -420 }],
    },
  ],
  actions: [
    {
      id: 'a1',
      title: 'Charge EV fleet overnight',
      asset: 'EV fleet',
      siteId: 's1',
      fromSchedule: '19:00-22:00',
      toSchedule: '01:00-04:00',
      monthlySaving: 420,
      confidence: 0.86,
      status: 'Recommended',
      rationale: 'Cheaper window',
    },
  ],
  monthly: [{ month: 'Feb 2026', actual: 81420, expected: 91600 }],
  assetMix: [{ asset: 'HVAC', kwh: 120000, spend: 26000 }],
  plans: [],
  suppliers: [],
  annualSpendTotal: 1800000,
  controlMode: 'Approve',
  uploads: [],
} as unknown as Workspace;

function stubFetch(payload: unknown, ok = true, status = 200): void {
  globalThis.fetch = (async () => ({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })) as unknown as typeof fetch;
}

async function main(): Promise<void> {
  console.log('EnerOS Copilot verification');

  console.log('\nbuildCopilotContext');
  const context = buildCopilotContext(workspace, null);
  check('includes the company name', context.includes('Harbour Hospitality Group'));
  check('includes actual spend', context.includes('81,420'), 'missing actual');
  check('includes expected spend', context.includes('9,200'), 'missing expected');
  check('includes the flagged invoice', context.includes('INV-1'));
  check('includes the optimiser action', context.includes('Charge EV fleet overnight'));
  check('states when live prices are missing', context.includes('unavailable'));

  console.log('\nanswerCopilot — happy path');
  stubFetch({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                answer: 'You spent £81,420 this month, £10,180 below baseline.',
                suggestions: ['Which sites are above baseline?', 'What should I approve first?'],
              }),
            },
          ],
        },
      },
    ],
  });
  const reply = await answerCopilot({ question: 'Where are we spending most?', context });
  check('returns source gemini', reply.source === 'gemini', reply.source);
  check('parses the answer', reply.answer.includes('81,420'), reply.answer);
  check('parses suggestions', reply.suggestions.length === 2, String(reply.suggestions.length));

  console.log('\nanswerCopilot — fenced JSON');
  stubFetch({
    candidates: [
      {
        content: {
          parts: [
            { text: '```json\n{"answer":"Fenced reply","suggestions":["Next?"]}\n```' },
          ],
        },
      },
    ],
  });
  const fenced = await answerCopilot({ question: 'Test', context });
  check('strips the markdown fence', fenced.answer === 'Fenced reply', fenced.answer);
  check('keeps suggestions from fenced JSON', fenced.suggestions[0] === 'Next?');

  console.log('\nanswerCopilot — non-JSON text');
  stubFetch({
    candidates: [{ content: { parts: [{ text: 'Just a plain sentence.' }] } }],
  });
  const plain = await answerCopilot({ question: 'Test', context });
  check('falls back to the raw text', plain.answer === 'Just a plain sentence.', plain.answer);
  check('still reports source gemini', plain.source === 'gemini');

  console.log('\nanswerCopilot — upstream failure');
  stubFetch({ error: 'boom' }, false, 500);
  const failedReply = await answerCopilot({ question: 'Test', context });
  check('reports unavailable on 500', failedReply.source === 'unavailable', failedReply.source);
  check('returns an empty answer so the client can fall back', failedReply.answer === '');

  console.log('\nAuditor narration');
  const { buildAuditContext, narrateAudit } = await import('../lib/auditor.js');
  const analysis = {
    score: 72,
    findings: [
      {
        code: 'unit-rate-above-cap',
        category: 'pricing',
        severity: 'high',
        title: 'Unit rate above the regional cap',
        detail: 'Billed 26.4p/kWh vs cap 24.6p/kWh.',
        evidence: [{ label: 'Billed rate', value: '26.4p/kWh' }],
        impactGbp: 420,
        confidence: 0.9,
        recommendation: 'Challenge the supplier.',
        source: 'ofgem-cap',
      },
    ],
    recoverableGbp: 420,
    periodDays: 31,
    expectedTotalGbp: 8900,
    effectiveRateP: 27.8,
    region: { id: 'north-western-england', name: 'North Western England', estimated: false },
    capPeriod: { id: '2026-Q4', label: '1 Oct - 31 Dec 2026', averageUnitRateP: 26.32, electricityVatPct: 0 },
  } as any;
  const bill = { supplier: 'British Gas Lite', consumptionKwh: 32000, unitRateP: 26.4, standingChargeP: 52, totalGbp: 8900 };
  const auditContext = buildAuditContext(analysis, bill);
  check('audit context includes the finding code', auditContext.includes('unit-rate-above-cap'));
  check('audit context includes the impact', auditContext.includes('420'), 'missing impact');
  check('audit context forbids new findings', auditContext.includes('Do not add findings'));

  stubFetch({
    candidates: [
      { content: { parts: [{ text: JSON.stringify({ summary: 'You were overcharged on the unit rate.', actions: ['Challenge the supplier', 'Request a back-bill review'] }) }] } },
    ],
  });
  const narration = await narrateAudit(analysis, bill);
  check('narration returns source gemini', narration.source === 'gemini', narration.source);
  check('narration parses the summary', narration.summary.includes('overcharged'), narration.summary);
  check('narration parses actions', narration.actions.length === 2, String(narration.actions.length));

  stubFetch({ error: 'down' }, false, 503);
  const noNarration = await narrateAudit(analysis, bill);
  check('narration degrades to unavailable', noNarration.source === 'unavailable');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
