'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, FileWarning, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useApp } from '../../store';
import { Badge, Card, EmptyState, ProgressBar, SectionHeading } from '../ui';
import { Money } from '../EvidenceMark';
import { gbp, pct } from '../../lib/format';
import type { ActionStatus } from '../../types';

const statusTone = { Recommended: 'outline', Approved: 'muted', Automated: 'solid' } as const;
const statusCopy: Record<ActionStatus, string> = {
  Recommended: 'Awaiting approval',
  Approved: 'Approved — ready to run',
  Automated: 'Automated within policy',
};

/**
 * The money screen.
 *
 * The plan's loop is observe → diagnose → propose → approve → execute → verify.
 * This panel owns propose → approve: every opportunity carries its evidence
 * (asset, schedule change, confidence), and nothing moves without a click until
 * you raise the trust level yourself.
 */
export default function SavingsPanel() {
  const {
    actions,
    invoices,
    sites,
    controlMode,
    setControlMode,
    advanceAction,
    recoverInvoice,
    getSiteById,
    pushToast,
  } = useApp();

  const ordered = useMemo(
    () =>
      [...actions].sort((a, b) => {
        const rank: Record<ActionStatus, number> = { Recommended: 0, Approved: 1, Automated: 2 };
        return rank[a.status] - rank[b.status] || b.monthlySaving - a.monthlySaving;
      }),
    [actions],
  );

  const awaiting = ordered.filter((action) => action.status === 'Recommended');
  const approved = ordered.filter((action) => action.status === 'Approved');
  const automated = ordered.filter((action) => action.status === 'Automated');
  const flagged = invoices.filter((invoice) => invoice.status === 'Flagged');
  const recovered = invoices.filter((invoice) => invoice.status === 'Recovered');

  const monthly = (list: typeof actions) => list.reduce((total, action) => total + action.monthlySaving, 0);
  const identified = monthly(ordered) + flagged.reduce((t, i) => t + Math.abs(i.issues.reduce((s, issue) => s + issue.impact, 0)), 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <SectionHeading
            title="Opportunities"
            subtitle="Deterministic rules decide; the copilot only explains. Each row is a schedule change or a fault with a £ value."
            action={<Badge tone="muted">{gbp(identified)}/mo identified</Badge>}
          />

          {ordered.length === 0 ? (
            <EmptyState title="No opportunities yet" hint="Upload a bill or import half-hourly data and the engine will price what can change." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {ordered.map((action) => (
                <li key={action.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink-900">{action.title}</p>
                      <Badge tone={statusTone[action.status]}>{statusCopy[action.status]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-700">
                      {getSiteById(action.siteId)?.name ?? action.siteId} · {action.asset} ·{' '}
                      <span className="tabular-nums">{action.fromSchedule} → {action.toSchedule}</span>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-700">{action.rationale}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <Money
                      value={
                        <span className="text-sm font-semibold text-ink-900">
                          {gbp(action.monthlySaving)}
                          <span className="text-[11px] font-normal text-neutral-600">/mo</span>
                        </span>
                      }
                      state="estimated"
                      evidence={{
                        inputs: [
                          `${action.asset} schedule ${action.fromSchedule} → ${action.toSchedule}`,
                          `${pct(action.confidence * 100, 0)} model confidence`,
                          getSiteById(action.siteId)?.name ?? action.siteId,
                        ],
                        arithmetic: 'Modelled saving if the schedule change is applied for a month.',
                        source: 'Deterministic rules on this site’s data — not yet executed.',
                      }}
                    />
                    <p className="text-[11px] text-neutral-600">{pct(action.confidence * 100, 0)} confidence</p>
                    {action.status !== 'Automated' && (
                      <button
                        type="button"
                        onClick={() => void advanceAction(action.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-ink-900 hover:bg-neutral-50"
                      >
                        {action.status === 'Recommended' ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5" /> Automate
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Bill issues to challenge"
            subtitle="Recoverable money the auditor found, with the evidence behind it."
            action={<Badge tone="muted">{flagged.length} open</Badge>}
          />
          {flagged.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-700">
              Nothing to challenge — every open invoice reconciles.
            </p>
          ) : (
            <ul className="space-y-2">
              {flagged.slice(0, 6).map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5">
                  <FileWarning className="h-4 w-4 shrink-0 text-neutral-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">
                      {getSiteById(invoice.siteId)?.name ?? invoice.siteId} · {invoice.period}
                    </p>
                    <p className="truncate text-xs text-neutral-700">
                      {invoice.issues.map((issue) => issue.type).join(' · ')}
                    </p>
                  </div>
                  <Money
                    value={
                      <span className="text-sm font-semibold text-ink-900">
                        {gbp(Math.abs(invoice.issues.reduce((sum, issue) => sum + issue.impact, 0)))}
                      </span>
                    }
                    state="issue"
                    evidence={{
                      inputs: [
                        `${invoice.id} · ${invoice.supplier}`,
                        invoice.issues.map((issue) => issue.type).join(' · '),
                      ],
                      arithmetic: 'Sum of the impacts the auditor attributed to this invoice.',
                      source: 'The invoice lines you uploaded, checked against your contract and reference rates.',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void recoverInvoice(invoice.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-ink-800"
                  >
                    Challenge
                  </button>
                </li>
              ))}
            </ul>
          )}
          {recovered.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-700">
              <ShieldCheck className="h-3.5 w-3.5" /> {recovered.length} invoice
              {recovered.length === 1 ? '' : 's'} in recovery ·{' '}
              {gbp(recovered.reduce((t, i) => t + Math.abs(i.issues.reduce((s, issue) => s + issue.impact, 0)), 0))}
            </p>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <SectionHeading title="Trust level" subtitle="How much may run without you." />
          <div className="space-y-2">
            {(['Recommend', 'Approve', 'Automate'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void setControlMode(mode)}
                className={
                  controlMode === mode
                    ? 'w-full rounded-lg border border-ink-900 bg-ink-900 px-3 py-2 text-left text-white'
                    : 'w-full rounded-lg border border-neutral-200 px-3 py-2 text-left hover:border-neutral-300 hover:bg-neutral-50'
                }
              >
                <span className="block text-sm font-semibold">{mode}</span>
                <span className={controlMode === mode ? 'block text-[11px] text-neutral-300' : 'block text-[11px] text-neutral-600'}>
                  {mode === 'Recommend'
                    ? 'Nothing runs. EnerOS only proposes.'
                    : mode === 'Approve'
                      ? 'One click per action before it runs.'
                      : 'Pre-approved classes run inside policy limits.'}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-neutral-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Hard limits on comfort and food safety always apply. Every command is logged; the kill
            switch above is always visible.
          </p>
        </Card>

        <Card className="bg-gradient-to-b from-neutral-50 to-white">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">Pipeline</p>
          <div className="mt-2 space-y-3 text-sm">
            {[
              ['Awaiting approval', awaiting, 'outline' as const],
              ['Approved', approved, 'muted' as const],
              ['Automated', automated, 'solid' as const],
            ].map(([label, list, tone]) => (
              <div key={label as string}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                    <Badge tone={tone as 'outline' | 'muted' | 'solid'}>{label as string}</Badge>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink-900">
                    {gbp(monthly(list as typeof actions))}<span className="text-[11px] font-normal text-neutral-600">/mo</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar
                    value={ordered.length === 0 ? 0 : Math.round((monthly(list as typeof actions) / Math.max(1, monthly(ordered))) * 100)}
                    tone={tone as 'outline' | 'muted' | 'solid'}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/optimiser"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-ink-900 hover:underline"
          >
            Open the optimiser <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
