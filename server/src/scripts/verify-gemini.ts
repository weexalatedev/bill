/**
 * verify-gemini — find exactly where a Gemini call fails.
 *
 *   npm run verify:gemini          # model selection + offline failure matrix + config report
 *   npm run verify:gemini -- --live # also make a REAL call (needs GEMINI_API_KEY)
 *
 * The offline matrix stubs `fetch` and asserts that every failure mode maps to a
 * named `GeminiFailure.code`. The live mode prints the real HTTP status and the
 * raw Google error message, which is what you actually need when a key is wrong,
 * a model is retired, or a quota is exhausted.
 */

const providedKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 0;
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-key';
// Pin a stub model so the failure matrix never triggers ListModels discovery;
// auto-selection itself has dedicated checks in runModelSelection below.
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'test-model';

const realFetch = globalThis.fetch;
const { callGeminiDetailed, describeGemini, pickCheapestGeminiModel, discoverCheapestGeminiModel } =
  await import('../lib/llm.js');
import type { GeminiFailureCode } from '../lib/llm.js';

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

const OK_PAYLOAD = { candidates: [{ content: { parts: [{ text: 'OK' }] } }] };

function stub(payload: unknown, ok = true, status = 200): void {
  globalThis.fetch = (async () => ({
    ok,
    status,
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  })) as unknown as typeof fetch;
}

function stubThrow(error: unknown): void {
  globalThis.fetch = (async () => {
    throw error;
  }) as unknown as typeof fetch;
}

const CALL = { system: 'test', messages: [{ role: 'user' as const, text: 'hi' }] };

async function expect(
  label: string,
  setup: () => void,
  expected: GeminiFailureCode,
  expectedStatus?: number,
): Promise<void> {
  setup();
  const result = await callGeminiDetailed(CALL);
  const code = result.failure?.code;
  const ok = !result.ok && code === expected && (expectedStatus === undefined || result.status === expectedStatus);
  check(label, ok, `got ok=${result.ok} code=${code} status=${result.status}`);
}

async function runModelSelection(): Promise<void> {
  console.log('\nModel selection — no hardcoded default, cheapest available wins');
  const names = [
    'models/gemini-2.5-pro',
    'models/gemini-2.5-flash',
    'models/gemini-2.5-flash-lite-preview',
    'models/gemini-2.5-flash-lite',
    'models/gemini-1.5-flash',
    'models/gemini-embedding-001',
    'models/imagen-3.0-generate-002',
    'models/aqa',
  ];
  const cheapest = pickCheapestGeminiModel(names);
  check('picks flash-lite — the cheapest tier offered', cheapest === 'gemini-2.5-flash-lite', String(cheapest));
  check('drops the retired gemini-1.5 family', !cheapest?.includes('1.5'), String(cheapest));
  check(
    'drops non-chat models (aqa, imagen, embeddings)',
    pickCheapestGeminiModel(['models/aqa', 'models/imagen-3.0-generate-002', 'models/gemini-embedding-001']) ===
      null,
  );
  check(
    'stable beats preview within a tier',
    pickCheapestGeminiModel(['models/gemini-2.5-flash-lite-preview', 'models/gemini-2.5-flash-lite']) ===
      'gemini-2.5-flash-lite',
  );
  check(
    'pro only when nothing cheaper is offered',
    pickCheapestGeminiModel(['models/gemini-2.5-pro']) === 'gemini-2.5-pro',
  );

  stub({
    models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
      { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ],
  });
  const discovered = await discoverCheapestGeminiModel();
  check(
    'ListModels discovery keeps generateContent models only and picks the cheapest',
    discovered === 'gemini-2.5-flash-lite',
    discovered,
  );
}

async function runMatrix(): Promise<void> {
  console.log('\nFailure matrix (stubbed fetch)');

  await expect(
    'HTTP 400 invalid key → code http, message surfaced from Google error body',
    () =>
      stub(
        { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } },
        false,
        400,
      ),
    'http',
    400,
  );
  await expect('HTTP 403 permission denied → http', () => stub({ error: { message: 'Permission denied' } }, false, 403), 'http', 403);
  await expect('HTTP 404 model not found → http', () => stub({ error: { message: 'models/x is not found' } }, false, 404), 'http', 404);
  await expect('HTTP 429 rate limited → http', () => stub({ error: { message: 'Quota exceeded' } }, false, 429), 'http', 429);
  await expect('HTTP 500 with a non-JSON body → http (detail captured)', () => stub('<html>oops</html>', false, 500), 'http', 500);
  await expect('fetch throws (DNS/offline) → network', () => stubThrow(new TypeError('fetch failed')), 'network');
  await expect(
    'aborted request → timeout',
    () => stubThrow(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    'timeout',
  );
  await expect(
    'prompt blocked → empty',
    () => stub({ promptFeedback: { blockReason: 'SAFETY' } }),
    'empty',
  );
  await expect('no candidates → empty', () => stub({ candidates: [] }), 'empty');
  await expect('candidate with no text → empty', () => stub({ candidates: [{ content: { parts: [] } }] }), 'empty');

  console.log('\nHappy path');
  stub(OK_PAYLOAD);
  const good = await callGeminiDetailed(CALL);
  check('200 with text → ok true', good.ok && good.text === 'OK', `ok=${good.ok} text=${good.text}`);
  check('no failure object on success', good.failure === undefined);
}

async function runLive(): Promise<void> {
  console.log('\nLive call (real network, real key)');
  globalThis.fetch = realFetch; // undo any stub from the matrix
  const config = describeGemini();
  if (!providedKey) {
    console.log('  ! No real GEMINI_API_KEY set — skipping the live call.');
    console.log('    Set it in server/.env, or: GEMINI_API_KEY=... npm run verify:gemini -- --live');
    return;
  }
  const result = await callGeminiDetailed({
    system: 'You are a connectivity test. Reply with exactly the word OK.',
    messages: [{ role: 'user', text: 'Reply OK.' }],
    temperature: 0,
  });
  if (result.ok) {
    check('live call succeeded', true);
    console.log(`  sample: ${(result.text ?? '').slice(0, 60)}`);
  } else {
    check('live call succeeded', false, `code=${result.failure?.code} status=${result.status}`);
    console.log('  failure:', JSON.stringify(result.failure, null, 2));
  }
}

async function main(): Promise<void> {
  console.log('EnerOS Gemini diagnostics');
  const config = describeGemini();
  console.log('\nConfiguration');
  console.log(`  configured : ${config.configured}`);
  console.log(`  model      : ${config.model}`);
  console.log(`  base URL   : ${config.baseUrl}`);
  console.log(`  key present: ${config.keyPresent}${config.keyHint ? ` (${config.keyHint})` : ''}`);
  check('a key is configured', config.keyPresent, 'set GEMINI_API_KEY in server/.env');

  await runModelSelection();
  await runMatrix();
  if (process.argv.includes('--live')) {
    await runLive();
  } else {
    console.log('\n(skipping the live call — pass --live to make one)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
