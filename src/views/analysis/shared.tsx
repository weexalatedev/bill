'use client';
import type { BillQuery, CapRegion } from '../../lib/api';
import type { FindingSeverity } from '../../types';
import type { Tone } from '../../components/ui';
import { gbp } from '../../lib/format';

export const severityTone: Record<FindingSeverity, Tone> = {
  high: 'solid',
  medium: 'outline',
  low: 'muted',
  info: 'ghost',
};

/** The severity glyph behind each finding — same ramp as the badge. */
export const severityChip: Record<FindingSeverity, string> = {
  high: 'bg-ink-900 text-white',
  medium: 'bg-white text-ink-900 ring-1 ring-inset ring-ink-900/20',
  low: 'bg-neutral-100 text-neutral-700',
  info: 'bg-transparent text-neutral-600 ring-1 ring-inset ring-neutral-200',
};

export const field =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12';
export const labelCls = 'mb-1 block text-xs font-medium text-neutral-600';

export interface FormState {
  supplier: string;
  periodStart: string;
  periodEnd: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
  totalGbp: string;
  vatGbp: string;
  nightShare: string;
  businessContract: boolean;
}

export const emptyForm: FormState = {
  supplier: '',
  periodStart: '',
  periodEnd: '',
  consumptionKwh: '',
  unitRateP: '',
  standingChargeP: '',
  totalGbp: '',
  vatGbp: '',
  nightShare: '',
  businessContract: false,
};

/** Build the API payload, omitting anything the user left blank. */
export function toQuery(form: FormState): BillQuery {
  const numOrUndef = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
  return {
    supplier: form.supplier.trim() || undefined,
    periodStart: form.periodStart || undefined,
    periodEnd: form.periodEnd || undefined,
    consumptionKwh: numOrUndef(form.consumptionKwh),
    unitRateP: numOrUndef(form.unitRateP),
    standingChargeP: numOrUndef(form.standingChargeP),
    totalGbp: numOrUndef(form.totalGbp),
    vatGbp: numOrUndef(form.vatGbp),
    nightShare: numOrUndef(form.nightShare),
    businessContract: form.businessContract || undefined,
    includeWeather: true,
  };
}

export function scoreTone(score: number | undefined): Tone {
  if (score === undefined) return 'muted';
  if (score >= 85) return 'muted';
  if (score >= 60) return 'outline';
  return 'solid';
}

/** Indicative annual cost for a region at a given usage — makes rate gaps concrete. */
export function annualCostAt(region: CapRegion, annualKwh: number): string {
  return gbp(Math.round((annualKwh * region.unitRateP) / 100 + region.standingChargeP * 365));
}

export function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-neutral-600">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
