'use client';
import { useRef, useState } from 'react';
import { FileText, Keyboard, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { Card, Field, controlClass } from '../../components/ui';
import { cx } from '../../lib/cx';

/**
 * Step 2 of the flow — "ask for an upload". A PDF or a photo of the bill; the
 * server extracts the figures (Gemini vision OCR when there is no text layer),
 * audits them and writes the advice.
 */
export default function UploadBill({
  busy,
  error,
  postcode,
  onPostcodeChange,
  onFile,
  onSwitchToManual,
}: {
  busy: boolean;
  error: string | null;
  postcode: string;
  onPostcodeChange: (value: string) => void;
  onFile: (file: File) => void;
  /** Hand back to the manual entry step. */
  onSwitchToManual: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pick = (file: File | undefined) => {
    if (file) onFile(file);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <Field label="Site postcode" hint="Optional, but it sharpens the UK benchmark to your region.">
          <input
            value={postcode}
            onChange={(event) => onPostcodeChange(event.target.value.toUpperCase())}
            placeholder="M1 4BT"
            className={controlClass + ' sm:max-w-xs'}
          />
        </Field>

        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files?.[0]);
          }}
          className={cx(
            'mt-5 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragging
              ? 'border-neutral-400 bg-neutral-50/60'
              : 'border-neutral-200 bg-neutral-50/60 hover:border-neutral-300 hover:bg-neutral-50/40',
            busy && 'cursor-progress opacity-70',
          )}
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-neutral-600" />
            ) : (
              <Upload className="h-5 w-5 text-neutral-600" />
            )}
          </span>
          <span>
            <span className="block text-sm font-semibold text-neutral-900">
              {busy ? 'Reading your bill…' : 'Drop your bill here, or click to choose a file'}
            </span>
            <span className="mt-1 block text-xs text-neutral-600">
              PDF, JPG, PNG or HEIC — up to 12 MB. Scans and photos are read with OCR.
            </span>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,text/plain,text/csv"
            className="hidden"
            onChange={(event) => {
              pick(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </button>

        {error && (
          <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-5">
          <button
            type="button"
            onClick={onSwitchToManual}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <Keyboard className="h-4 w-4" /> Type the figures instead
          </button>
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Nothing is stored — the check is read-only.
          </p>
        </div>
      </Card>

      <Card className="flex items-start gap-3 bg-neutral-50/70">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
        <p className="text-xs leading-relaxed text-neutral-600">
          We never keep the file. It is read in memory to extract the figures, audited against the
          Ofgem price cap, and then discarded.
        </p>
      </Card>
    </div>
  );
}
