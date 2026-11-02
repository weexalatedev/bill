'use client';
import { useState, type FormEvent } from 'react';
import { Loader2, ScanSearch, Upload } from 'lucide-react';
import { Card, Field, controlClass } from '../../components/ui';

export interface BillFormValues {
  supplier: string;
  postcode: string;
  periodStart: string;
  periodEnd: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
  totalGbp: string;
  vatGbp: string;
}

export const EMPTY_BILL: BillFormValues = {
  supplier: '',
  postcode: '',
  periodStart: '',
  periodEnd: '',
  consumptionKwh: '',
  unitRateP: '',
  standingChargeP: '',
  totalGbp: '',
  vatGbp: '',
};

/**
 * A worked example that genuinely is above the reference rate, so a visitor who
 * taps "use an example" sees the savings story end-to-end (unit rate 29.4p vs a
 * ~26.3p GB average on 9,200 kWh).
 */
export const EXAMPLE_BILL: BillFormValues = {
  supplier: 'British Gas Lite',
  postcode: 'M1 4BT',
  periodStart: '2026-02-01',
  periodEnd: '2026-02-28',
  consumptionKwh: '9200',
  unitRateP: '29.4',
  standingChargeP: '62',
  totalGbp: '2885',
  vatGbp: '96',
};

const numOrUndef = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const strOrUndef = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/** Map the form to the public bill-check payload. */
export function toBillPayload(values: BillFormValues) {
  return {
    supplier: strOrUndef(values.supplier),
    postcode: strOrUndef(values.postcode),
    periodStart: strOrUndef(values.periodStart),
    periodEnd: strOrUndef(values.periodEnd),
    consumptionKwh: numOrUndef(values.consumptionKwh),
    unitRateP: numOrUndef(values.unitRateP),
    standingChargeP: numOrUndef(values.standingChargeP),
    totalGbp: numOrUndef(values.totalGbp),
    vatGbp: numOrUndef(values.vatGbp),
  };
}

/** True when there is at least one figure the engine can check. */
export function hasEnoughToCheck(values: BillFormValues): boolean {
  return Boolean(values.consumptionKwh.trim() || values.unitRateP.trim() || values.totalGbp.trim());
}

/**
 * Step 1 of the flow — "ask for a bill". The visitor types the figures from their
 * latest invoice; we check them against the published UK reference rate.
 */
export default function BillForm({
  busy,
  error,
  onSubmit,
  onSwitchToUpload,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (values: BillFormValues) => void;
  /** Hand off to the upload step — "or upload the bill instead". */
  onSwitchToUpload: () => void;
}) {
  const [values, setValues] = useState<BillFormValues>(EMPTY_BILL);
  const [touched, setTouched] = useState(false);

  const set = (key: keyof BillFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!hasEnoughToCheck(values)) return;
    onSubmit(values);
  };

  const incomplete = touched && !hasEnoughToCheck(values);

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier" hint="Optional — the name on the bill.">
            <input
              value={values.supplier}
              onChange={set('supplier')}
              placeholder="British Gas Lite"
              className={controlClass}
            />
          </Field>
          <Field label="Postcode" hint="Sets your Ofgem price-cap region.">
            <input
              value={values.postcode}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, postcode: event.target.value.toUpperCase() }))
              }
              placeholder="M1 4BT"
              className={controlClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Period start">
            <input
              type="date"
              value={values.periodStart}
              onChange={set('periodStart')}
              className={controlClass}
            />
          </Field>
          <Field label="Period end">
            <input
              type="date"
              value={values.periodEnd}
              onChange={set('periodEnd')}
              className={controlClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Consumption (kWh)">
            <input
              type="number"
              min={0}
              value={values.consumptionKwh}
              onChange={set('consumptionKwh')}
              placeholder="9200"
              className={controlClass}
            />
          </Field>
          <Field label="Unit rate (p/kWh)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.unitRateP}
              onChange={set('unitRateP')}
              placeholder="29.4"
              className={controlClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Standing charge (p/day)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.standingChargeP}
              onChange={set('standingChargeP')}
              placeholder="62"
              className={controlClass}
            />
          </Field>
          <Field label="Bill total (£)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.totalGbp}
              onChange={set('totalGbp')}
              placeholder="2885"
              className={controlClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="VAT charged (£)" hint="Optional.">
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.vatGbp}
              onChange={set('vatGbp')}
              placeholder="96"
              className={controlClass}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setValues(EXAMPLE_BILL);
                setTouched(false);
              }}
              className="text-sm font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
            >
              Use an example bill
            </button>
          </div>
        </div>

        {incomplete && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Enter at least your total, your unit rate or your consumption so we have something to
            check.
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {busy ? 'Checking your bill…' : 'Check my bill'}
          </button>
          <button
            type="button"
            onClick={onSwitchToUpload}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" /> Upload the bill instead
          </button>
        </div>
      </form>
    </Card>
  );
}
