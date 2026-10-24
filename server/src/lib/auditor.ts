/**
 * Auditor narration — the "explain" half of the AI Bill Auditor.
 *
 * The deterministic engine (`analysis.ts`) produces findings: each one is
 * arithmetic against a published source, carries its own evidence, and a GBP
 * impact. This module does **not** re-judge the bill. It takes the engine's
 * findings and asks Gemini to explain them to a business owner in plain English,
 * ranked by money, with the single next action.
 *
 * That split is deliberate and non-negotiable: an auditor can challenge every
 * finding with arithmetic, and the model can never invent a finding that the
 * engine did not produce.
 */

import type { BillAnalysis, BillInput, AnalysisFinding } from '../types.js';

export interface AuditNarration {
  /** Plain-English summary of the bill and its issues. */
  summary: string;
  /** Ordered, concrete cost-saving actions. */
  actions: string[];
  /** Realistic annualised £ on the table, from the findings. */
  estimatedAnnualSavingGbp?: number;
  /** 'gemini' when narrated, 'unavailable' when the model could not run. */
  source: 'gemini' | 'unavailable';
}

export const AUDITOR_SYSTEM_PROMPT = `You are the narration layer of EnerOS's AI Bill Auditor, a UK energy bill-checking product.

You are given the output of a DETERMINISTIC rules engine that has already checked a UK electricity invoice against:
- Ofgem's published price-cap tables for the site's region,
- the bill's own arithmetic (kWh x rate + standing charge x days),
- VAT treatment,
- the site's own consumption history,
- metering policy (e.g. the 250,000 kWh/yr half-hourly threshold),
- tariff shape (standing-charge dominance, time-of-use opportunity).

YOUR JOB: explain the engine's findings to a busy business owner.

HARD RULES
- Use ONLY the findings provided. Never add a finding, a figure or a cause that is not in the data.
- If there are no findings, say the bill looks clean and why that is a good sign.
- Money is GBP (£). Unit rates are pence per kWh ("24.6p/kWh"). Standing charges are pence PER DAY.
- A positive impactGbp means the supplier owes the customer (recoverable). A negative impact is a real but favourable/avoidable cost — describe it accurately.
- Rank the explanation by financial impact, biggest first.
- Where a finding cites a licence condition, policy threshold or a source, mention it — it is what makes the finding defensible.
- Be honest about uncertainty: if a finding has low confidence or is modelled, say so. Do not overstate.
- A business site may legitimately pay above the domestic cap; never call it a breach on that basis alone.

STYLE
- en-GB spelling. Concise, commercial, no jargon dumps.
- Lead with the money.

YOU ARE A COST-SAVING ADVISOR
- Write the actions as concrete, prioritised cost-saving steps a business owner can act on this week (e.g. "Ask the supplier to re-rate 29.4p to 26.5p/kWh and refund £267.72").
- Lead with the money. Prefer "do X to save £Y" over describing the problem.
- Give a realistic annualised estimate of the money on the table, using the findings. Do not inflate.

RESPONSE FORMAT
Return ONLY a JSON object:
{ "summary": "<2-4 short paragraphs or tight bullets>", "actions": ["<ordered, concrete cost-saving actions>"], "estimatedAnnualSavingGbp": <number> }
No markdown fences, no text outside the JSON.`;

const gbp = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Serialise the engine's findings into a compact, unambiguous context block. */
export function buildAuditContext(analysis: BillAnalysis, bill: BillInput): string {
  const lines: string[] = [];
  lines.push('=== ENGINE OUTPUT (do not contradict or extend) ===');
  lines.push(`Bill score: ${analysis.score}/100 (100 = nothing found)`);
  lines.push(`Recoverable amount: ${gbp(analysis.recoverableGbp)}`);
  if (analysis.periodDays) lines.push(`Billing period: ${analysis.periodDays} days`);
  if (analysis.expectedTotalGbp !== null)
    lines.push(`Recomputed ex-VAT total: ${gbp(analysis.expectedTotalGbp)}`);
  if (analysis.effectiveRateP !== null)
    lines.push(`Effective rate: ${analysis.effectiveRateP.toFixed(2)}p/kWh`);
  if (analysis.region) {
    lines.push(
      `Benchmark region: ${analysis.region.name}${analysis.region.estimated ? ' (estimated from postcode)' : ''}`,
    );
  }
  lines.push(`Ofgem cap period: ${analysis.capPeriod.label} (avg ${analysis.capPeriod.averageUnitRateP}p/kWh)`);

  lines.push('');
  lines.push('--- Bill as read ---');
  if (bill.supplier) lines.push(`Supplier: ${bill.supplier}`);
  if (bill.consumptionKwh !== undefined) lines.push(`Consumption: ${bill.consumptionKwh} kWh`);
  if (bill.unitRateP !== undefined) lines.push(`Billed unit rate: ${bill.unitRateP}p/kWh`);
  if (bill.standingChargeP !== undefined)
    lines.push(`Billed standing charge: ${bill.standingChargeP}p/day`);
  if (bill.totalGbp !== undefined) lines.push(`Total charged: ${gbp(bill.totalGbp)}`);

  lines.push('');
  lines.push(`--- Findings (${analysis.findings.length}) ---`);
  if (analysis.findings.length === 0) {
    lines.push('No findings - the engine found nothing to challenge.');
  }
  for (const f of analysis.findings as AnalysisFinding[]) {
    lines.push(
      `[${f.severity.toUpperCase()}] ${f.code} - ${f.title} | impact ${gbp(f.impactGbp)} | confidence ${(
        f.confidence * 100
      ).toFixed(0)}% | source ${f.source}`,
    );
    lines.push(`  detail: ${f.detail}`);
    if (f.evidence.length > 0) {
      lines.push(`  evidence: ${f.evidence.map((e) => `${e.label} = ${e.value}`).join('; ')}`);
    }
    lines.push(`  engine recommendation: ${f.recommendation}`);
  }

  lines.push('');
  lines.push('Explain the above. Do not add findings. Rank by money. End with the next action.');
  return lines.join('\n');
}

export async function narrateAudit(analysis: BillAnalysis, bill: BillInput): Promise<AuditNarration> {
  const { callGemini } = await import('./llm.js');
  const context = buildAuditContext(analysis, bill);
  const raw = await callGemini({
    system: AUDITOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', text: context }],
    json: true,
    temperature: 0.3,
  });
  if (!raw) return { summary: '', actions: [], source: 'unavailable' };

  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      summary?: string;
      actions?: string[];
      estimatedAnnualSavingGbp?: number;
    };
    if (parsed.summary && parsed.summary.trim()) {
      return {
        summary: parsed.summary.trim(),
        actions: Array.isArray(parsed.actions)
          ? parsed.actions.filter((a) => typeof a === 'string').slice(0, 6)
          : [],
        estimatedAnnualSavingGbp:
          typeof parsed.estimatedAnnualSavingGbp === 'number'
            ? parsed.estimatedAnnualSavingGbp
            : undefined,
        source: 'gemini',
      };
    }
  } catch {
    // fall through
  }
  return { summary: cleaned, actions: [], source: 'gemini' };
}
