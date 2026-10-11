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

import { env, geminiEnabled, geminiModel } from '../env.js';
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

/**
 * Turn raw bill text into a typed `BillInput`.
 *
 * Returns `null` when extraction is not configured or the model did not return
 * usable JSON — callers fall back to the manual entry form.
 */
export async function extractBill(text: string): Promise<ExtractedBill | null> {
  if (!geminiEnabled || !text.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs * 5);

  try {
    const url =
      env.analysis.geminiBaseUrl + '/models/' + geminiModel + ':generateContent?key=' + env.analysis.geminiApiKey;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Extract this electricity invoice:\n\n<invoice>\n${text.slice(0, 60_000)}\n</invoice>`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    // Defensive: a stray fence should not break extraction.
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return normalise(parsed as Record<string, unknown>);
  } catch {
    // Not configured, timed out, upstream error or unparseable — degrade to the
    // manual entry form rather than failing the request.
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs);
  try {
    const payload: any = {
      model: geminiModel,
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
      env.analysis.geminiBaseUrl + '/models/' + geminiModel + ':generateContent?key=' + env.analysis.geminiApiKey;
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
 * Low-level Gemini call used by both the Copilot and any future grounded
 * feature. Returns the raw text (or a JSON-parsed object when `json` is set),
 * or null on any failure so callers degrade gracefully.
 */
export async function callGemini(options: {
  system: string;
  messages: Array<{ role: 'user' | 'model'; text: string }>;
  json?: boolean;
  temperature?: number;
}): Promise<string | null> {
  if (!geminiEnabled) return null;
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
      env.analysis.geminiBaseUrl + '/models/' + geminiModel + ':generateContent?key=' + env.analysis.geminiApiKey;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Gemini ' + res.status);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
