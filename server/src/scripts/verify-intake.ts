/**
 * verify-intake — the upload → audit → advice pipeline, offline.
 *
 *   npm run verify:intake
 *
 * Stubs Gemini so it runs with no key and no network.
 */

process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MODEL = 'gemini-1.5-flash';

const { analyseDocument } = await import('../lib/intake.js');
import type { Site } from '../types.js';

const SITE = { region: 'north-western-england', postcode: 'M1 4BT' } as unknown as Site;

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

const EXTRACTION = {
  supplier: 'Test Energy',
  periodStart: '2026-02-01',
  periodEnd: '2026-02-28',
  consumptionKwh: 9200,
  unitRateP: 29.4,
  standingChargeP: 62,
  totalGbp: 2885,
  vatGbp: 96,
  confidence: 0.92,
  fieldsNeedingReview: [],
};

let captured: string[] = [];
function stub(isNarrationBody: (body: string) => boolean, narration: object | null): void {
  captured = [];
  globalThis.fetch = (async (_url: string, init: { body?: string }) => {
    const body = String(init?.body ?? '');
    captured.push(body);
    const isNarration = isNarrationBody(body);
    if (isNarration && narration === null) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' };
    }
    const payload = isNarration ? narration : EXTRACTION;
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      text: async () => '',
    };
  }) as unknown as typeof fetch;
}

const BILL_TEXT =
  'TEST ENERGY INVOICE\nPeriod: 1 Feb 2026 to 28 Feb 2026\nConsumption: 9200 kWh\nUnit rate: 29.4 p\nTotal: 2885.00 GBP\n';

async function main(): Promise<void> {
  console.log('EnerOS intake verification');

  console.log('\nUpload → audit → advice');
  stub((body) => body.includes('narration layer'), {
    summary: 'You were overcharged on the unit rate.',
    actions: ['Ask the supplier to re-rate', 'Request a credit'],
    estimatedAnnualSavingGbp: 3212,
  });
  const ok = await analyseDocument(Buffer.from(BILL_TEXT), SITE);
  check('marks the upload as ok', ok.ok, ok.note ?? '');
  check('extracts the supplier', (ok.extracted as { supplier?: string })?.supplier === 'Test Energy');
  check('produces a deterministic audit', (ok.analysis?.findings.length ?? 0) > 0, String(ok.analysis?.findings.length));
  check('audits the unit rate', ok.analysis?.findings.some((f) => f.code === 'unit-rate-above-cap') ?? false);
  check('returns AI advice', ok.advice?.source === 'gemini', ok.advice?.source);
  check('advice carries an annual estimate', ok.advice?.estimatedAnnualSavingGbp === 3212, String(ok.advice?.estimatedAnnualSavingGbp));
  check('advice carries actions', (ok.advice?.actions.length ?? 0) === 2, String(ok.advice?.actions.length));

  console.log('\nAdvice failure degrades, findings stay');
  stub((body) => body.includes('narration layer'), null);
  const partial = await analyseDocument(Buffer.from(BILL_TEXT), SITE);
  check('still ok when advice fails', partial.ok);
  check('findings still returned', (partial.analysis?.findings.length ?? 0) > 0);
  check('advice marked unavailable', partial.advice?.source === 'unavailable', partial.advice?.source);
  check('explains the degradation', Boolean(partial.note), partial.note ?? '');

  console.log('\nUnreadable input');
  const empty = await analyseDocument(Buffer.from('   '));
  check('rejects empty input', !empty.ok);
  check('gives a clear note', Boolean(empty.note), empty.note ?? '');

  console.log('\nOCR / vision fallback');
  stub((body) => body.includes('narration layer'), {
    summary: 'Scan read.',
    actions: ['Act on the rate'],
    estimatedAnnualSavingGbp: 1000,
  });
  // A PNG: no text layer, so the pipeline must send the bytes to vision.
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3, 4,
  ]);
  const fromImage = await analyseDocument(png, SITE);
  check('flags the file as needing OCR', fromImage.needsOcr, String(fromImage.needsOcr));
  check('uses the vision path', fromImage.usedVision, String(fromImage.usedVision));
  check('sends inline image data to the model', captured.some((b) => b.includes('inline_data')), 'no inline_data');
  check('still audits the extracted fields', (fromImage.analysis?.findings.length ?? 0) > 0);
  check('returns advice for the scan', fromImage.advice?.source === 'gemini', fromImage.advice?.source);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
