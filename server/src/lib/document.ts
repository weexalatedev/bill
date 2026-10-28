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

// Import order matters: pdf.js reads DOMMatrix / ImageData / Path2D from
// globalThis while its module loads, before `pdf-parse` is usable. The stubs
// must therefore be in place first — see pdfjs-polyfills.ts.
import './pdfjs-polyfills.js';
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

/** Detect common image formats by magic bytes (for the OCR/vision path). */
function isImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp =
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP';
  const heic = buffer.subarray(4, 8).toString('latin1') === 'ftyp';
  return png || jpeg || webp || heic;
}

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
  if (!isPdf && isImage(buffer)) {
    // A photo or screenshot: no text layer to read locally. The caller sends the
    // bytes to the vision model, which does OCR.
    return { text: '', length: 0, needsOcr: true, pages: 1 };
  }
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