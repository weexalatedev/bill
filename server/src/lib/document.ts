/**
 * Document text extraction — turns an uploaded invoice into text the extraction
 * LLM can read.
 *
 * Bills arrive as PDFs (the common case), as images (a phone photo of a bill),
 * or as plain text (copy-paste). PDFs are parsed locally with `pdf-parse`; images
 * are not OCR'd here because OCR needs a vision model or a paid OCR API. When a
 * PDF yields no text layer it is almost always a scan, so the caller is told
 * plainly rather than being handed an empty extraction.
 */

import { PDFParse } from 'pdf-parse';

export interface ExtractedDocument {
  text: string;
  /** How many characters of usable text were found. */
  length: number;
  /** True when a PDF had no text layer (i.e. it is a scan and needs OCR). */
  needsOcr: boolean;
  pages: number;
}

/** Guard against a hostile or mis-sized upload consuming the whole request. */
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Best-effort text extraction. Never throws — on failure it returns an empty
 * result with `needsOcr` set, so the route can respond with a useful message.
 */
export async function extractDocumentText(buffer: Buffer): Promise<ExtractedDocument> {
  if (buffer.length === 0) return { text: '', length: 0, needsOcr: false, pages: 0 };
  if (buffer.length > MAX_BYTES) {
    throw new Error('Document is larger than the 12 MB limit.');
  }

  const isPdf =
    buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!isPdf) {
    // Plain text, CSV or a JSON export straight from a supplier portal.
    const text = buffer.toString('utf8').replace(/\u00a0/g, ' ');
    const printable = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    return { text: printable, length: printable.length, needsOcr: false, pages: 0 };
  }

  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = (result.text ?? '').replace(/\u00a0/g, ' ').trim();
    return {
      text,
      length: text.length,
      // A PDF under ~200 characters of text is a scan, not a text invoice.
      needsOcr: text.length < 200,
      pages: result.total ?? 0,
    };
  } catch {
    return { text: '', length: 0, needsOcr: true, pages: 0 };
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}