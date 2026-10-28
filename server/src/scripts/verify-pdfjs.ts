/**
 * verify-pdfjs — the pdf-parse import chain, offline and canvas-less.
 *
 *   npm run verify:pdfjs
 *
 * Guards the deployment failure where `@napi-rs/canvas` is unavailable (its
 * native skia addon cannot be installed on hosts like Vercel): importing
 * `pdfjs-dist` then throws `ReferenceError: DOMMatrix is not defined` at
 * module scope. `pdfjs-polyfills.ts` — imported by `document.ts` before
 * `pdf-parse` — must prevent that, and text extraction must still work.
 */

const { extractDocumentText } = await import('../lib/document.js');

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

/** A one-page A4 PDF whose text layer holds `lines` — xref offsets are exact. */
function buildTinyPdf(lines: string[]): Buffer {
  const stream =
    'BT /F1 10 Tf 14 TL 1 0 0 1 40 800 Tm\n' +
    lines.map((line) => `(${line}) Tj\nT*\n`).join('') +
    'ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function main(): Promise<void> {
  console.log('EnerOS pdfjs verification');

  // Importing document.js already pulled in pdf-parse; the DOM globals pdf.js
  // needs must now exist regardless of whether @napi-rs/canvas is installed.
  const g = globalThis as Record<string, unknown>;
  console.log('\nDOM globals for pdf.js');
  check('defines DOMMatrix', typeof g.DOMMatrix === 'function');
  check('defines ImageData', typeof g.ImageData === 'function');
  check('defines Path2D', typeof g.Path2D === 'function');

  console.log('\nText extraction');
  // ≥ 200 characters in total so the "under 200 chars of text means it is a
  // scan" heuristic in document.ts classifies this as a text PDF, not a scan.
  const billLines = [
    'Test Energy invoice',
    'Period 1 Feb 2026 to 28 Feb 2026',
    'Consumption 9200 kWh at 29.4 p per kWh',
    'Standing charge 62 p per day across 28 days',
    'Subtotal 2800.00 GBP, VAT 480.00 GBP, total due 3280.00 GBP',
    'MPAN 12345678901, account 987654321',
    'This line exists so the text layer passes the scan-detection threshold.',
  ];
  const doc = await extractDocumentText(buildTinyPdf(billLines));
  check('reads the text layer', doc.text.includes('Test Energy invoice'), JSON.stringify(doc.text));
  check('does not mistake it for a scan', !doc.needsOcr, String(doc.needsOcr));
  check('counts one page', doc.pages === 1, String(doc.pages));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
