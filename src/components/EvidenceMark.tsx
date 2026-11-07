'use client';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * What kind of number is this?
 *
 *   verified  — every input comes from the customer's own documents and the
 *               arithmetic can be shown (baseline vs actual, invoice totals).
 *   estimated — a model or a published reference rate does part of the work.
 *   issue     — a finding: money we believe is wrong until recovered.
 *
 * The dot is drawn by `.eos-evidence[data-state]` in index.css, so the mark and
 * the legend are the same object everywhere.
 */
export type EvidenceState = 'verified' | 'estimated' | 'issue';

const LABEL: Record<EvidenceState, string> = {
  verified: 'Verified',
  estimated: 'Estimated',
  issue: 'Issue',
};

export interface Evidence {
  /** The values that went in, in words. */
  inputs: string[];
  /** The arithmetic, in words. */
  arithmetic: string;
  /** Where the inputs came from. */
  source: string;
}

/**
 * The mark. Without `evidence` it is a dot plus its label; with `evidence` the
 * dot is a summary that opens the drawer holding the calculation.
 */
export default function EvidenceMark({
  state,
  evidence,
  label,
  className,
}: {
  state: EvidenceState;
  evidence?: Evidence;
  /** Show the word beside the dot. Off for dense tables. */
  label?: boolean;
  className?: string;
}) {
  const body = (
    <span className={cx('eos-evidence', className)} data-state={state} role="img" aria-label={LABEL[state]}>
      {label ? LABEL[state] : null}
    </span>
  );

  if (!evidence) return body;

  return (
    <details className="eos-evidence-details relative inline-block">
      <summary title={`${LABEL[state]} — show the evidence`} aria-label={`${LABEL[state]} — show the evidence`}>
        {body}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-[var(--radius-card)] border border-hairline bg-raised p-3 text-left shadow-[var(--eos-card-shadow)]">
        <p
          className={cx(
            'eos-evidence text-[11px] font-semibold',
            state === 'verified' && 'text-verified',
            state === 'estimated' && 'text-estimated',
            state === 'issue' && 'text-issue',
          )}
          data-state={state}
        >
          {LABEL[state]}
        </p>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-text-2">
          {evidence.inputs.map((input) => (
            <li key={input}>· {input}</li>
          ))}
        </ul>
        <p className="mt-2 border-t border-hairline pt-2 text-[11px] leading-relaxed text-text-2">
          {evidence.arithmetic}
        </p>
        <p className="mt-1.5 text-[11px] text-text-3">Source: {evidence.source}</p>
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
}: {
  value: ReactNode;
  state: EvidenceState;
  evidence?: Evidence;
  className?: string;
}) {
  return (
    <span className={cx('inline-flex items-baseline gap-1.5 tabular-nums', className)}>
      <span>{value}</span>
      <EvidenceMark state={state} evidence={evidence} />
    </span>
  );
}
