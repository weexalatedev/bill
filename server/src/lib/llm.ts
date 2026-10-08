/**
 * LLM-assisted bill extraction — the "read the PDF" half of Smart Analysis.
 *
 * This is deliberately *narrow*. The LLM does exactly one job: turn messy bill
 * text into a typed `BillInput`. It never decides whether a bill is correct —
 * `analysis.ts` does that, deterministically. That split is what keeps the
 * product defensible: an auditor can challenge a finding with arithmetic, and
 * can always see the raw text the extraction came from.
 *
 * Implemented against the Anthropic Messages API with a forced tool call, so the
 * response is schema-validated rather than free text. No SDK dependency: the
 * server only needs global `fetch`.
 */

import { env, llmEnabled, geminiEnabled, geminiModel } from '../env.js';
import type { BillInput } from '../types.js';

const field = (type: string, description: string, extra: Record<string, unknown> = {}) => ({
  type,
  description,
  ...extra,
});

const EXTRACTION_TOOL = {
  name: 'record_bill',
  description:
    'Record every field you can find on a UK electricity invoice. Leave a field out entirely if the bill does not state it — never guess.',
  input_schema: {
    type: 'object',
    properties: {
      supplier: field('string', 'Energy supplier name as printed.'),
      accountNumber: field('string', 'Supplier account / customer number.'),
      mpan: field('string', '11-digit Electricity Meter Point Admin Number.'),
      meterPointSerial: field('string', 'Meter serial / Asset Id.'),
      tariffName: field('string', 'Tariff name and type, e.g. "Flex Direct 24".'),
      meterType: field('string', 'Meter type.', {
        enum: ['Smart', 'Advanced', 'AMR', 'Half-hourly', 'Prepayment', 'Unknown'],
      }),
      periodStart: field('string', 'Billing period start as YYYY-MM-DD.'),
      periodEnd: field('string', 'Billing period end as YYYY-MM-DD.'),
      consumptionKwh: field('number', 'Electricity consumed in kWh.'),
      unitRateP: field('number', 'Unit rate in pence per kWh (e.g. 24.6, not 0.246).'),
      standingChargeP: field('number', 'Standing charge in pence per day.'),
      subtotalGbp: field('number', 'Subtotal excluding VAT, GBP.'),
      vatGbp: field('number', 'VAT amount charged, GBP.'),
      totalGbp: field('number', 'Total amount charged including VAT, GBP.'),
      currency: field('string', 'ISO currency, normally GBP.'),
      paymentMethod: field('string', 'How the bill is paid.', {
        enum: ['direct-debit', 'standard-credit', 'prepayment'],
      }),
      isEstimate: field('boolean', 'True if readings are estimated, not actual.'),
      confidence: field('number', 'Overall confidence 0–1 in this extraction.'),
      fieldsNeedingReview: field('array', 'Fields that were ambiguous or partially legible.', {
        items: { type: 'string' },
      }),
    },
    required: ['totalGbp', 'confidence'],
  },
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

/** True when an LLM key is configured — the UI uses this to hide the paste box. */
export const extractionAvailable = llmEnabled;

/**
 * Turn raw bill text into a typed `BillInput`.
 *
 * Returns `null` when extraction is not configured or the model did not return a
 * usable tool call — callers fall back to the manual entry form.
 */
export async function extractBill(text: string): Promise<ExtractedBill | null> {
  if (!llmEnabled || !text.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.analysis.upstreamTimeoutMs * 5);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.analysis.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.analysis.anthropicModel,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
        messages: [
          {
            role: 'user',
            content: `Extract this electricity invoice:\n\n<invoice>\n${text.slice(0, 60_000)}\n</invoice>`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await res.json()) as {
      content?: { type: string; input?: unknown }[];
    };
    const toolUse = payload.content?.find((block) => block.type === 'tool_use');
    if (!toolUse?.input) return null;
    return normalise(toolUse.input as Record<string, unknown>);
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
