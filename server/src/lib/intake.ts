/**
 * Document intake pipeline — the "upload a bill and get advice" flow.
 *
 *   1. extract text from the PDF/text file (`document.ts`)
 *   2. if there is no text layer (a scan or photo), send the bytes to Gemini
 *      vision, which reads the image/PDF directly and does the OCR
 *   3. read the fields with Gemini (`llm.ts`)
 *   4. audit deterministically (`analysis.ts`)
 *   5. write cost-saving advice (`auditor.ts`, also Gemini)
 *
 * The engine still decides; the model only reads and explains.
 */

import { extractDocumentText } from './document.js';
import { extractBill, extractBillFromFile, extractionAvailable } from './llm.js';
import { analyseBill } from './analysis.js';
import { narrateAudit, type AuditNarration } from './auditor.js';
import type { BillAnalysis, BillInput, Site } from '../types.js';

export interface IntakeResult {
  ok: boolean;
  needsOcr: boolean;
  usedVision: boolean;
  pages: number;
  textLength: number;
  extractionAvailable: boolean;
  extracted: (Partial<BillInput> & Record<string, unknown>) | null;
  analysis: BillAnalysis | null;
  advice: AuditNarration | null;
  note?: string;
}

/** Detect the file type from magic bytes, so callers need not pass a MIME type. */
function guessMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') return 'image/heic';
  return null;
}

const canVision = (mime: string): boolean => mime === 'application/pdf' || mime.startsWith('image/');

export async function analyseDocument(
  buffer: Buffer,
  site?: Site,
  mimeType?: string,
): Promise<IntakeResult> {
  const doc = await extractDocumentText(buffer);
  const base = {
    needsOcr: doc.needsOcr,
    usedVision: false,
    pages: doc.pages,
    textLength: doc.length,
    extractionAvailable,
  };

  if (!extractionAvailable) {
    return {
      ...base,
      ok: false,
      extracted: null,
      analysis: null,
      advice: null,
      note: 'AI reading is not switched on for this deployment, so we cannot read the file automatically. You can still paste the figures into the manual form.',
    };
  }

  // Text path first; fall back to vision (OCR) when there is no usable text.
  let extracted = doc.length >= 20 ? await extractBill(doc.text) : null;
  let usedVision = false;

  if (!extracted) {
    const mime = mimeType ?? guessMime(buffer);
    if (mime && canVision(mime)) {
      extracted = await extractBillFromFile(buffer, mime);
      usedVision = true;
    }
  }

  if (!extracted) {
    return {
      ...base,
      usedVision,
      ok: false,
      extracted: null,
      analysis: null,
      advice: null,
      note: doc.needsOcr
        ? 'We could not read this scan. Try a clearer, well-lit photo or a text PDF, or enter the figures manually.'
        : 'We could not read this bill automatically. Try the manual form, or a clearer file.',
    };
  }

  const analysis = analyseBill(extracted, site);
  const advice = await narrateAudit(analysis, extracted);

  return {
    ...base,
    usedVision,
    ok: true,
    extracted: extracted as unknown as Partial<BillInput> & Record<string, unknown>,
    analysis,
    advice,
    ...(advice.source === 'unavailable'
      ? { note: 'Advice is unavailable right now; the audit findings above are still valid.' }
      : {}),
  };
}
