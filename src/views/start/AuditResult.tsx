'use client';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Info, ListChecks, Receipt } from 'lucide-react';
import { Badge, Card, type Tone } from '../../components/ui';
import { gbp, gbp2, pct, pence } from '../../lib/format';
import type { BillBenchmark } from '../../types';

export interface AuditFindingView {
  code: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  impactGbp: number;
  recommendation: string;
}

export interface AuditAdviceView {
  summary: string;
  actions: string[];
}

/** Everything the audit screen renders, normalised from either intake path. */
export interface AuditView {
  score: number;
  recoverableGbp: number;
  findings: AuditFindingView[];
  benchmark: BillBenchmark | null;
  capLabel: string;
  capUnitRateP: number;
  regionName: string | null;
  advice: AuditAdviceView | null;
  note?: string;
}

const severityTone: Record<string, Tone> = {
  high: 'solid',
  medium: 'outline',
  low: 'muted',
  info: 'ghost',
};

/**
 * The audit screen — the payoff of the free bill check. It leads with the one
 * number that matters (what the bill *should* have cost), proves it against the
 * published UK reference rate, then lists the findings behind it.
 */
export default function AuditResult({
  audit,
  footer,
}: {
  audit: AuditView;
  /** Action buttons rendered under the findings. */
  footer?: ReactNode;
}) {
  const benchmark = audit.benchmark;
  const saving = benchmark?.savingGbp ?? null;
  const actual = benchmark?.actualTotalGbp ?? null;
  const expected = benchmark?.expectedTotalGbp ?? null;
  const canSave = saving !== null && saving > 0.5;
  const topFinding = [...audit.findings].sort((a, b) => b.impactGbp - a.impactGbp)[0];
  const barMax = Math.max(actual ?? 0, expected ?? 0, 1);

  return (
    <div className="space-y-4">
      <Card tone="ink" className="eos-aura overflow-hidden sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
              <Receipt className="h-3.5 w-3.5" /> Your audit
            </p>
            {canSave ? (
              <>
                <p className="mt-3 text-sm text-neutral-300">You could save</p>
                <p className="eos-text-gradient-light mt-1 text-6xl font-semibold tracking-tight tabular-nums">
                  {gbp(saving)}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
                  You paid {gbp(actual ?? 0)} for this period. At the UK median rate for your usage
                  it would be about {gbp(expected ?? 0)} — you are{' '}
                  <span className="font-semibold text-white">{pct(benchmark?.savingPct ?? 0)}</span>{' '}
                  above the median.
                </p>
                {topFinding && (
                  <p className="mt-3 text-xs text-neutral-400">
                    Main reason: <span className="text-neutral-100">{topFinding.title}</span>
                  </p>
                )}
              </>
            ) : saving !== null ? (
              <>
                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  Your bill looks in line with the UK median
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
                  You paid {gbp(actual ?? 0)} against a benchmark of {gbp(expected ?? 0)}. No obvious
                  overcharge on this bill — but the checks below are still worth reading.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-2xl font-semibold tracking-tight">We read your bill</p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
                  Add your consumption and total to see exactly what you should have paid against the
                  UK median rate.
                </p>
              </>
            )}
          </div>
          <div className="flex gap-3 lg:flex-col">
            <div className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center backdrop-blur">
              <p className="text-2xl font-semibold tracking-tight text-white tabular-nums">
                {audit.score}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-300">score</p>
            </div>

            {actual !== null && expected !== null && (
              <div className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-wider text-neutral-300">You paid</p>
                <p className="text-lg font-semibold tabular-nums text-white">{gbp(actual)}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-neutral-300">
                  UK median
                </p>
                <p className="text-lg font-semibold tabular-nums text-neutral-200">
                  {gbp(expected)}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {actual !== null && expected !== null && (
        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-neutral-900">Your bill vs the UK median</p>
            <Badge tone="muted" className="w-fit">
              {benchmark?.label} · {pence(benchmark?.unitRateP ?? 0)}/kWh
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-neutral-600">
            The same{' '}
            {benchmark?.consumptionKwh
              ? `${benchmark.consumptionKwh.toLocaleString('en-GB')} kWh `
              : 'usage '}
            priced at the published reference rate over {benchmark?.periodDays} days.
          </p>
          <div className="mt-4 space-y-3">
            <ComparisonBar label="You paid" value={actual} max={barMax} variant="muted" />
            <ComparisonBar label="UK median" value={expected} max={barMax} variant="solid" />
          </div>
        </Card>
      )}

      {audit.advice && (
        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <ListChecks className="h-4 w-4 text-neutral-600" /> What to do about it
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">{audit.advice.summary}</p>
          {audit.advice.actions.length > 0 && (
            <ul className="mt-3 space-y-2">
              {audit.advice.actions.map((action, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-neutral-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
                  {action}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-neutral-900">What we found</p>
          <Badge tone="muted">Ofgem cap {pence(audit.capUnitRateP, 2)}</Badge>
        </div>
        {audit.findings.length === 0 ? (
          <p className="flex items-start gap-2 rounded-md bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Nothing obvious — the bill
            reconciles.
          </p>
        ) : (
          <ul className="space-y-3">
            {audit.findings.map((finding, index) => (
              <li
                key={`${finding.code}-${index}`}
                className="rounded-lg border border-neutral-100 p-3"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="flex items-start gap-2">
                    <Badge tone={severityTone[finding.severity] ?? 'muted'}>
                      {finding.severity}
                    </Badge>
                    <p className="text-sm font-semibold text-neutral-900">{finding.title}</p>
                  </div>
                  {Math.abs(finding.impactGbp) > 0 && (
                    <span className="shrink-0 self-end tabular-nums text-sm font-semibold text-neutral-800 sm:self-auto">
                      {gbp2(finding.impactGbp)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{finding.detail}</p>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-neutral-700">
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                  {finding.recommendation}
                </p>
              </li>
            ))}
          </ul>
        )}
        {(audit.note || audit.regionName) && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-600">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {audit.note ??
              `Benchmarked against ${audit.regionName} reference rates for ${audit.capLabel}.`}
          </p>
        )}
      </Card>

      {footer}
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  max,
  variant,
}: {
  label: string;
  value: number;
  max: number;
  /** `solid` is the reference bar; `muted` is what the customer actually paid. */
  variant: 'solid' | 'muted';
}) {
  const width = Math.max(4, Math.round((value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-600">{label}</span>
        <span className="font-semibold text-ink-900 tabular-nums">{gbp(value)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className={
            variant === 'solid'
              ? 'h-full rounded-full bg-ink-900'
              : 'h-full rounded-full bg-neutral-400'
          }
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
