'use client';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * What kind of number is this?
 *
 *   verified  — every input comes from the customer's own documents, and the
 *               arithmetic can be shown (baseline vs actual, invoice totals).
 *   estimated — a model or a published reference rate is doing part of the work
 *               (an opportunity's £/mo, a benchmark on a bill we have not audited).
 *   issue     — a finding: money the engine believes is wrong until recovered.
 *
 * The rule the product lives by: never call something verified unless the
 * drawer can show the calculation.
 */
export type EvidenceState = 'verified' | 'estimated' | 'issue';

const LABEL: Record<EvidenceState, string> = {
  verified: 'Verified',
  estimated: 'Estimated',
  issue: 'Issue',
};

export interface Evidence {
  /** The values that went in, in words (e.g. “baseline £91,600 · actual £81,420”). */
  inputs: string[];
  /** The arithmetic, in words. */
  arithmetic: string;
  /** Where the inputs came from. */
  source: string;
}

/**
 * The dot. With `evidence` it opens a drawer holding the calculation; without
 * it, the dot is a labelled marker only (use that when the state is obvious
 * from context, e.g. a table that already has an Evidence column).
 */
export default function EvidenceMark({
  state,
  evidence,
  className,
}: {
  state: EvidenceState;
  evidence?: Evidence;
  className?: string;
}) {
  const dot = <span className={cx('eos-evidence', `eos-evidence--${state}`)} aria-hidden />;
  const label = LABEL[state];

  if (!evidence) {
    return (
      <span className={cx('inline-flex items-center', className)} title={label} role="img" aria-label={label}>
        {dot}
      </span>
    );
  }

  return (
    <details className={cx('eos-evidence-details relative inline-block', className)}>
      <summary title={`${label} — show the evidence`} aria-label={`${label} — show the evidence`}>
        {dot}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-lg shadow-ink-950/10">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-900">
          {dot} {label}
        </p>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-neutral-700">
          {evidence.inputs.map((input) => (
            <li key={input}>· {input}</li>
          ))}
        </ul>
        <p className="mt-2 border-t border-neutral-100 pt-2 text-[11px] leading-relaxed text-neutral-700">
          {evidence.arithmetic}
        </p>
        <p className="mt-1.5 text-[11px] text-neutral-600">Source: {evidence.source}</p>
      </div>
    </details>
  );
}

/** A figure with its mark — one format, tabular figures, mark always adjacent. */
export function Money({
  value,
  state,
  evidence,
  className,
  markClassName,
}: {
  value: ReactNode;
  state: EvidenceState;
  evidence?: Evidence;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cx('inline-flex items-baseline gap-1.5 tabular-nums', className)}>
      <span>{value}</span>
      <EvidenceMark state={state} evidence={evidence} className={markClassName} />
    </span>
  );
}
