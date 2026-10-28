/**
 * LLM-assisted bill extraction — the "read the PDF" half of Smart Analysis.
 *
 * This is deliberately *narrow*. The LLM does exactly one job: turn messy bill
 * text into a typed `BillInput`. It never decides whether a bill is correct —
 * `analysis.ts` does that, deterministically. That split is what keeps the
 * product defensible: an auditor can challenge a finding with arithmetic, and
 * can always see the raw text the extraction came from.
 *
 * Implemented against the Gemini generateContent API with a schema-constrained
 * JSON response (responseSchema + application/json), so the response is
 * schema-validated rather than free text. No SDK dependency: the server only
 * needs global `fetch`.
 */

import { env, geminiEnabled } from '../env.js';
import type { BillInput } from '../types.js';

const field = (type: string, description: string, extra: Record<string, unknown> = {}) => ({
  type,
  description,
  ...extra,
});

/**
 * Gemini responseSchema (OpenAPI subset). Every field is optional except
 * totalGbp + confidence, and the model must never invent a figure — the
 * deterministic engine downstream only trusts what was printed on the bill.
 */
const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  description: 'Record of a UK electricity invoice.',
  properties: {
    supplier: field('STRING', 'Energy supplier name as printed.'),
    accountNumber: field('STRING', 'Supplier account / customer number.'),
    mpan: field('STRING', '11-digit Electricity Meter Point Admin Number.'),
    meterPointSerial: field('STRING', 'Meter serial / Asset Id.'),
    tariffName: field('STRING', 'Tariff name and type, e.g. "Flex Direct 24".'),
    meterType: field('STRING', 'Meter type.', {
      enum: ['Smart', 'Advanced', 'AMR', 'Half-hourly', 'Prepayment', 'Unknown'],
    }),
    periodStart: field('STRING', 'Billing period start as YYYY-MM-DD.'),
    periodEnd: field('STRING', 'Billing period end as YYYY-MM-DD.'),
    consumptionKwh: field('NUMBER', 'Electricity consumed in kWh.'),
    unitRateP: field('NUMBER', 'Unit rate in pence per kWh (e.g. 24.6, not 0.246).'),
    standingChargeP: field('NUMBER', 'Standing charge in pence per day.'),
    subtotalGbp: field('NUMBER', 'Subtotal excluding VAT, GBP.'),
    vatGbp: field('NUMBER', 'VAT amount charged, GBP.'),
    totalGbp: field('NUMBER', 'Total amount charged including VAT, GBP.'),
    currency: field('STRING', 'ISO currency, normally GBP.'),
    paymentMethod: field('STRING', 'How the bill is paid.', {
      enum: ['direct-debit', 'standard-credit', 'prepayment'],
    }),
    isEstimate: field('BOOLEAN', 'True if readings are estimated, not actual.'),
    confidence: field('NUMBER', 'Overall confidence 0–1 in this extraction.'),
    fieldsNeedingReview: field('ARRAY', 'Fields that were ambiguous or partially legible.', {
      items: { type: 'STRING' },
    }),
  },
  required: ['totalGbp', 'confidence'],
};

const SYSTEM_PROMPT = `You extract structured data from UK electricity invoices for an energy analytics product.

Rules:
- Read only what is printed. If a figure is absent, omit the key entirely rather than estimating it.
- UK conventions: pence per kWh (24.6 means 24.6p, not 0.246); standing charge is pence PER DAY; money is GBP.
- Business invoices often show "unit rate (p/kWh)" and "standing charge (p/day)" on separate lines; a standing charge billed across 31 days is still one number in pence per day.
- MPANs are 11 digits. Ignore spaces when reporting them.
- Estimated readings are a material fact: set isEstimate true whenever the bill says "estimate", no customer reading is present, or a reading looks typed over.
- If a table renders two rate bands (day/night), report the weighted average in unitRateP and note the bands in fieldsNeedingReview.`;

export interface ExtractedBill extends Partial<BillInput> {
  accountNumber?: string;
  mpan?: string;
  meterPointSerial?: string;
  meterType?: string;
  isEstimate?: boolean;
  currency?: string;
  /** Subtotal excluding VAT — kept for reconciliation against `totalGbp`. */
  subtotalGbp?: number;
  confidence: number;
  fieldsNeedingReview: string[];
}

/** True when a Gemini key is configured — the UI uses this to hide the paste box. */
export const extractionAvailable = geminiEnabled;

// ── Model selection — there is NO hardcoded default model ────────────────────
//
// Google retires models (gemini-1.5-flash was removed from the API), so a name
// pinned in source is a guaranteed future 404 — the exact failure this block
// replaces. Instead:
//   • GEMINI_MODEL set  → use it verbatim (operator override / stub testing).
//   • GEMINI_MODEL empty → ask the API which models this key can use
//     (ListModels) and pick the CHEAPEST tier available: flash-lite → flash →
//     pro → other, preferring stable over preview and newer over older. The
//     pick is cached per process; a 404 "model not found" from generateContent
//     drops the cache so the next call re-discovers instead of failing forever.

/** Used only when ListModels itself is unreachable (the network is already broken). */
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** How long a successful auto-pick is reused before re-discovering (1 hour). */
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;

/** After a failed discovery, retry ListModels this soon (1 minute). */
const DISCOVERY_RETRY_TTL_MS = 60 * 1000;

let autoModel: string | null = null;
let autoModelAt = 0;
let discoveryInflight: Promise<string> | null = null;

/**
 * Pick the cheapest usable chat model from a list of ListModels names.
 *
 * ListModels carries no prices, so rank by Google's published tiers (lite <
 * flash < pro < anything else), preferring stable over preview and newer
 * versions over older. Non-chat models (embeddings, imagen, veo, aqa, gemma…)
 * and the retired gemini-1.5 family are dropped. Exported for
 * `npm run verify:gemini`.
 */
export function pickCheapestGeminiModel(names: string[]): string | null {
  const usable = names
    .map((name) => name.replace(/^models\//, ''))
    .filter((name) => {
      const n = name.toLowerCase();
      return (
        n.startsWith('gemini') && // chat models only
        !n.includes('embedding') &&
        !n.includes('tuned') &&
        !n.startsWith('gemini-1.5') // retired — would recreate the original 404
      );
    });

  const tier = (n: string): number =>
    n.includes('lite') ? 0 : n.includes('flash') ? 1 : n.includes('pro') ? 2 : 3;
  const isPreview = (n: string): boolean =>
    n.includes('preview') || n.includes('experimental') || /-exp\d*$/.test(n);
  const version = (n: string): number => {
    if (n.includes('latest')) return Number.MAX_SAFE_INTEGER; // alias for the newest
    const match = /(\d+)\.(\d+)/.exec(n);
    return match ? Number(match[1]) * 1000 + Number(match[2]) : 0;
  };

  const ranked = [...usable].sort((a, b) => {
    const an = a.toLowerCase();
    const bn = b.toLowerCase();
    return (
      tier(an) - tier(bn) ||
      Number(isPreview(an)) - Number(isPreview(bn)) ||
      version(bn) - version(an) ||
      a.localeCompare(b)
    );
  });
  return ranked[0] ?? null;
}

/**
 * Ask the API which models this key can use (ListModels) and pick the cheapest
 * chat model that supports generateContent. Exported for `verify:gemini`.
 */
export async function discoverCheapestGeminiModel(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs);
  try {
    const names: string[] = [];
    let pageToken = '';
    for (let page = 0; page < 10; page += 1) {
      const url =
        env.analysis.geminiBaseUrl +
        '/models?key=' +
        env.analysis.geminiApiKey +
        '&pageSize=50' +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('ListModels returned HTTP ' + res.status);
      const data = (await res.json()) as {
        models?: Array<{
          name?: string;
          supportedGenerationMethods?: string[];
          supportedActions?: string[];
        }>;
        nextPageToken?: string;
      };
      for (const model of data.models ?? []) {
        // v1beta reports supportedGenerationMethods; the v1 shape is
        // supportedActions. Keep the model when either lists generateContent
        // (or when the API omits the field — the name filter re-checks).
        const methods = model.supportedGenerationMethods ?? model.supportedActions ?? [];
        if (methods.length === 0 || methods.includes('generateContent')) {
          names.push(model.name ?? '');
        }
      }
      pageToken = data.nextPageToken ?? '';
      if (!pageToken) break;
    }
    const picked = pickCheapestGeminiModel(names);
    if (!picked) throw new Error('ListModels returned no usable gemini chat model');
    return picked;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the model a generateContent call should use. An explicit
 * GEMINI_MODEL always wins; otherwise the cheapest available model is
 * discovered once via ListModels and cached.
 */
export async function resolveGeminiModel(): Promise<string> {
  const explicit = env.analysis.geminiModel;
  if (explicit) return explicit;

  const now = Date.now();
  if (autoModel && now - autoModelAt < MODEL_CACHE_TTL_MS) return autoModel;
  if (!discoveryInflight) {
    discoveryInflight = (async () => {
      try {
        const model = await discoverCheapestGeminiModel();
        autoModel = model;
        autoModelAt = Date.now();
        console.info('[gemini] auto-selected the cheapest available model:', model);
        return model;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[gemini] model discovery failed — falling back for now:', message);
        // Do not pretend the fallback is a real pick: backdate the cache so
        // discovery is retried after DISCOVERY_RETRY_TTL_MS.
        autoModel = FALLBACK_MODEL;
        autoModelAt = Date.now() - MODEL_CACHE_TTL_MS + DISCOVERY_RETRY_TTL_MS;
        return FALLBACK_MODEL;
      } finally {
        discoveryInflight = null;
      }
    })();
  }
  return discoveryInflight;
}

/** Forget the auto-picked model so the next call re-discovers (retired?). */
export function invalidateGeminiModel(): void {
  autoModel = null;
  autoModelAt = 0;
}

/** The model the next generateContent call will use (sync, for diagnostics). */
export function currentGeminiModel(): string {
  return env.analysis.geminiModel || autoModel || 'auto (cheapest available)';
}

/** True when Google says the requested model itself does not exist. */
function isModelNotFound(status: number | undefined, detail: string): boolean {
  return (
    status === 404 &&
    /is not found for API version|is not supported for generateContent|model[^\n]*not (?:found|exist)/i.test(
      detail,
    )
  );
}

/**
 * Turn raw bill text into a typed `BillInput`.
 *
 * Returns `null` when extraction is not configured or the model did not return
 * usable JSON — callers fall back to the manual entry form.
 */
export async function extractBill(text: string): Promise<ExtractedBill | null> {
  if (!geminiEnabled || !text.trim()) return null;
  return runExtraction([
    {
      text: `Extract this electricity invoice:\n\n<invoice>\n${text.slice(0, 60_000)}\n</invoice>`,
    },
  ]);
}

/**
 * OCR path: send the raw image or PDF bytes to Gemini's vision input. Gemini
 * reads the text in the image/PDF itself, so no separate OCR engine is needed.
 * Used when the file has no usable text layer (a scan or a phone photo).
 */
export async function extractBillFromFile(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedBill | null> {
  if (!geminiEnabled || buffer.length === 0) return null;
  return runExtraction([
    { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
    {
      text: 'Extract this electricity invoice from the attached file. Read all visible text in the image or PDF first, then record the fields.',
    },
  ]);
}

/** Shared generateContent loop for text and vision extraction. */
async function runExtraction(
  parts: Array<Record<string, unknown>>,
): Promise<ExtractedBill | null> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA,
    },
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const model = await resolveGeminiModel();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs * 5);
    try {
      const url =
        env.analysis.geminiBaseUrl + '/models/' + model + ':generateContent?key=' + env.analysis.geminiApiKey;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        if (attempt === 0 && !env.analysis.geminiModel && isModelNotFound(res.status, errorBody)) {
          invalidateGeminiModel();
          continue;
        }
        throw new Error(`Gemini API error ${res.status}: ${errorBody.slice(0, 300)}`);
      }

      const payload = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return null;
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      return normalise(parsed as Record<string, unknown>);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Coerce the model's numbers into the shape `analysis.ts` expects. */
function normalise(raw: Record<string, unknown>): ExtractedBill {
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const parsed = Number.parseFloat(v.replace(/[£,]/g, ''));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  return {
    supplier: str(raw.supplier),
    accountNumber: str(raw.accountNumber),
    mpan: str(raw.mpan)?.replace(/\s+/g, ''),
    meterPointSerial: str(raw.meterPointSerial),
    tariffName: str(raw.tariffName),
    meterType: str(raw.meterType),
    periodStart: str(raw.periodStart),
    periodEnd: str(raw.periodEnd),
    consumptionKwh: num(raw.consumptionKwh),
    unitRateP: num(raw.unitRateP),
    standingChargeP: num(raw.standingChargeP),
    subtotalGbp: num(raw.subtotalGbp),
    vatGbp: num(raw.vatGbp),
    totalGbp: num(raw.totalGbp),
    currency: str(raw.currency) ?? 'GBP',
    paymentMethod: str(raw.paymentMethod) as BillInput['paymentMethod'],
    isEstimate: raw.isEstimate === true,
    confidence: num(raw.confidence) ?? 0.5,
    fieldsNeedingReview: Array.isArray(raw.fieldsNeedingReview)
      ? raw.fieldsNeedingReview.filter((f): f is string => typeof f === 'string')
      : [],
  };
}

/** Prompt given top priority so the model stays in character and grounded. */
export const systemPromptGemini = `
You are EnerOS Copilot, an AI energy manager for UK SMEs.

You help business owners understand their energy spending, identify savings opportunities,
and operate their assets more efficiently.

Guidelines:
- Always ground your answers in the customer's actual data (spend, baseline, findings).
- Never claim savings without referencing a methodology (baseline → intervention → outcome).
- Use the customer's £ numbers, not generic statements.
- If you don't know something from the data, say so rather than hallucinating.
- You may discuss: spend patterns, bill anomalies, tariff insights, efficiency recommendations,
  flexibility opportunities, and baseline vs actual comparisons.
- Never make up equipment schedules, savings amounts, or tariff rates.
- Format all GBP as £X,XXX.XX and all rates as X p/kWh.
- Keep answers concise but informative.
`;

/**
 * Grounded chat via Gemini — used by the Copilot.
 *
 * The Copilot explains decisions; the deterministic engine (`analysis.ts`)
 * decides. This function is only called when a Gemini key is configured;
 * with no key the app still runs on the deterministic Copilot, it simply
 * reports the live layer as unavailable.
 */
export async function getGeminiChat(
  text: string,
  history: Array<{ role: string; content: string }> = [],
): Promise<string | null> {
  if (!geminiEnabled) return null;
  const model = await resolveGeminiModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs);
  try {
    const payload: any = {
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPromptGemini + '\n\n' + text }],
        },
      ],
      generationConfig: { temperature: 0.7 },
    };
    if (history.length > 0) {
      payload.contents = [];
      payload.contents.push({
        role: 'user',
        parts: [{ text: systemPromptGemini }],
      });
      for (const turn of history) {
        payload.contents.push({
          role: turn.role,
          parts: [{ text: turn.content }],
        });
      }
      payload.contents.push({
        role: 'user',
        parts: [{ text }],
      });
    }
    const url =
      env.analysis.geminiBaseUrl + '/models/' + model + ':generateContent?key=' + env.analysis.geminiApiKey;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Gemini API ' + res.status + ': ' + err);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const candidates = data.candidates ?? [];
    if (candidates.length === 0 || !candidates[0].content) return null;
    return candidates[0]?.content?.parts?.[0]?.text ?? null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Why a Gemini call failed. Every branch is named so the caller (and the
 * diagnose endpoint / verify:gemini script) can say exactly what went wrong
 * instead of a silent null.
 */
export type GeminiFailureCode =
  | 'no-key'
  | 'http'
  | 'network'
  | 'timeout'
  | 'empty'
  | 'parse';

export interface GeminiFailure {
  code: GeminiFailureCode;
  message: string;
  /** HTTP status when the failure came from an upstream response. */
  status?: number;
  /** Raw upstream body (truncated) for HTTP failures. */
  detail?: string;
  /** The model that was requested. */
  model?: string;
  /** Actionable next step for this specific failure. */
  hint?: string;
}

/** Turn a failure into the single most useful thing to try next. */
function hintFor(code: GeminiFailureCode, status: number | undefined, message: string): string {
  const m = message.toLowerCase();
  if (code === 'no-key') return 'Set GEMINI_API_KEY in server/.env and restart the API.';
  if (code === 'timeout') return 'Gemini did not answer in time — raise UPSTREAM_TIMEOUT_MS or check connectivity.';
  if (code === 'network') return 'The server could not reach generativelanguage.googleapis.com — check outbound network/proxy.';
  if (code === 'empty') return 'The prompt was blocked or returned no text — check the prompt and safety settings.';
  if (status === 400 && (m.includes('api key') || m.includes('api_key'))) return 'The API key is invalid — regenerate it at aistudio.google.com/app/apikey.';
  if (status === 403) return 'The key lacks access, or the Generative Language API is not enabled for the project.';
  if (status === 429) return 'Rate limit or quota exceeded — wait, or unset GEMINI_MODEL to auto-select the cheapest tier.';
  if (status === 404 || m.includes('not found') || m.includes('not supported'))
    return 'The model name is not available on this API — unset GEMINI_MODEL to auto-select the cheapest available model, or list them via GET ' + 'v1beta/models' + '?key=…';
  if (status === 500 || status === 503) return 'Gemini had a server-side error — retry; this is usually transient.';
  return 'See the raw detail for the upstream response.';
}

export interface GeminiResult {
  ok: boolean;
  text: string | null;
  failure?: GeminiFailure;
  status?: number;
}

/** Shape of a Google API error envelope. */
interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

function failure(code: GeminiFailureCode, message: string, extra: Partial<GeminiFailure> = {}): GeminiFailure {
  const merged = { code, message, model: currentGeminiModel(), ...extra };
  return { ...merged, hint: merged.hint ?? hintFor(code, merged.status, message) };
}

/**
 * Low-level Gemini call. Unlike the original, this NEVER hides the reason for a
 * failure — it returns a typed `GeminiFailure` so callers can log it and the
 * diagnose endpoint can show it.
 *
 * The model is resolved first (explicit GEMINI_MODEL, else the cheapest
 * available via ListModels). If Google retires that model mid-process, the
 * cache is dropped and the call is retried once with a fresh pick.
 */
export async function callGeminiDetailed(options: GeminiCallOptions): Promise<GeminiResult> {
  if (!geminiEnabled) {
    return {
      ok: false,
      text: null,
      failure: failure('no-key', 'GEMINI_API_KEY is not set on the server.'),
    };
  }

  const model = await resolveGeminiModel();
  let result = await attemptGeminiCall(model, options);

  // A retired model name is recoverable in auto mode: forget the pick, ask
  // ListModels again, and retry once with whatever is cheapest now.
  if (
    !env.analysis.geminiModel &&
    isModelNotFound(result.status, result.failure?.detail ?? result.failure?.message ?? '')
  ) {
    invalidateGeminiModel();
    const fresh = await resolveGeminiModel();
    if (fresh !== model) result = await attemptGeminiCall(fresh, options);
  }
  return result;
}

/** Shared options of every generateContent call. */
interface GeminiCallOptions {
  system: string;
  messages: Array<{ role: 'user' | 'model'; text: string }>;
  json?: boolean;
  temperature?: number;
}

/** One generateContent attempt against a specific, already-resolved model. */
async function attemptGeminiCall(model: string, options: GeminiCallOptions): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs);
  try {
    const contents = [
      { role: 'user', parts: [{ text: options.system }] },
      { role: 'model', parts: [{ text: 'Understood. I will follow those rules exactly.' }] },
      ...options.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    ];
    const payload = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.4,
        ...(options.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const url =
      env.analysis.geminiBaseUrl +
      '/models/' +
      model +
      ':generateContent?key=' +
      env.analysis.geminiApiKey;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 600);
      } catch {
        detail = '';
      }
      let message = 'Gemini returned HTTP ' + res.status + '.';
      try {
        const parsed = JSON.parse(detail) as GoogleErrorBody;
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        /* detail was not JSON */
      }
      return {
        ok: false,
        text: null,
        status: res.status,
        failure: failure('http', message, { status: res.status, detail }),
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      return {
        ok: false,
        text: null,
        failure: failure('empty', 'Gemini blocked the prompt: ' + data.promptFeedback.blockReason),
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!text) {
      const reason = data.candidates?.[0]?.finishReason ?? 'no candidates returned';
      return { ok: false, text: null, failure: failure('empty', 'Gemini returned no text (' + reason + ').') };
    }
    return { ok: true, text, status: res.status };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : 'unknown error';
    if (name === 'AbortError') {
      return {
        ok: false,
        text: null,
        failure: failure('timeout', 'Gemini did not respond within ' + env.analysis.upstreamTimeoutMs + 'ms.'),
      };
    }
    return {
      ok: false,
      text: null,
      failure: failure('network', 'Could not reach Gemini: ' + message),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience wrapper that logs the failure reason server-side and returns the
 * text (or null). Callers keep degrading gracefully; operators get a log line.
 */
export async function callGemini(options: {
  system: string;
  messages: Array<{ role: 'user' | 'model'; text: string }>;
  json?: boolean;
  temperature?: number;
}): Promise<string | null> {
  const result = await callGeminiDetailed(options);
  if (!result.ok) {
    const f = result.failure;
    console.error(
      '[gemini] call failed',
      JSON.stringify({ code: f?.code, status: f?.status, model: f?.model, message: f?.message }),
    );
    return null;
  }
  return result.text;
}

/** Non-secret summary of the Gemini configuration, for the diagnose endpoint. */
export function describeGemini(): {
  configured: boolean;
  model: string;
  baseUrl: string;
  keyPresent: boolean;
  keyHint: string | null;
} {
  const key = env.analysis.geminiApiKey;
  return {
    configured: geminiEnabled,
    model: currentGeminiModel(),
    baseUrl: env.analysis.geminiBaseUrl,
    keyPresent: Boolean(key),
    keyHint: key ? key.slice(0, 4) + '…' + key.slice(-2) : null,
  };
}
