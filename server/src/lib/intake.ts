/**
 * Document intake pipeline — the "upload a bill and get advice" flow.
 *
 *   1. extract text from the PDF/text file (`document.ts`)
 *   2. read the fields with Gemini (`llm.ts` extractBill)
 *   3. audit deterministically (`analysis.ts`)
 *   4. write cost-saving advice (`auditor.ts`, also Gemini)
 *
 * The engine still decides; the model only reads and explains. Every stage
 * degrades with a clear message rather than throwing, so the UI can always tell
 * the user what happened (scanned PDF, no AI key, unreadable bill).
 */

import { extractDocumentText } from './document.js';
import { extractBill, extractionAvailable } from './llm.js';
import { analyseBill } from './analysis.js';
import { narrateAudit, type AuditNarration } from './auditor.js';
import type { BillAnalysis, BillInput, Site } from '../types.js';

export interface IntakeResult {
  ok: boolean;
  needsOcr: boolean;
  pages: number;
  textLength: number;
  extractionAvailable: boolean;
  extracted: (Partial<BillInput> & Record<string, unknown>) | null;
  analysis: BillAnalysis | null;
  advice: AuditNarration | null;
  /** Human-readable reason when ok is false. */
  note?: string;
}

export async function analyseDocument(buffer: Buffer, site?: Site): Promise<IntakeResult> {
  const doc = await extractDocumentText(buffer);
  const base = {
    needsOcr: doc.needsOcr,
    pages: doc.pages,
    textLength: doc.length,
    extractionAvailable,
  };

  if (doc.length < 20) {
    return {
      ...base,
      ok: false,
      extracted: null,
      analysis: null,
      advice: null,
      note: doc.needsOcr
        ? 'This looks like a scanned image with no text layer. Try a PDF exported from your supplier portal, or enter the figures manually.'
        : 'We could not read any text from that file. Try a PDF, or enter the figures manually.',
    };
  }

  if (!extractionAvailable) {
    return {
      ...base,
      ok: false,
      extracted: null,
      analysis: null,
      advice: null,
      note: 'AI reading is not switched on for this deployment, so we cannot read the PDF automatically. You can still paste the figures into the manual form.',
    };
  }

  const extracted = await extractBill(doc.text);
  if (!extracted) {
    return {
      ...base,
      ok: false,
      extracted: null,
      analysis: null,
      advice: null,
      note: 'We could not read this bill automatically. Try the manual form, or a clearer PDF.',
    };
  }

  const analysis = analyseBill(extracted, site);
  const advice = await narrateAudit(analysis, extracted);

  return {
    ...base,
    ok: true,
    extracted: extracted as unknown as Partial<BillInput> & Record<string, unknown>,
    analysis,
    advice,
    ...(advice.source === 'unavailable'
      ? { note: 'Advice is unavailable right now; the audit findings above are still valid.' }
      : {}),
  };
}
