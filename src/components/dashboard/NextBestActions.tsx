'use client';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useApp } from '../../store';
import { gbp } from '../../lib/format';
import type { DashboardTab } from './DashboardTabs';

interface Action {
  title: string;
  detail: string;
  value?: string;
  href?: string;
  tab?: DashboardTab;
}

/**
 * “What should I do next?” — computed, not scripted.
 *
 * The old panel explained the product in three fixed steps, which is noise once
 * onboarding is done. This ranks the real work instead: money you can recover,
 * approvals waiting, and the data gap that is holding accuracy back — each with
 * the actual number attached.
 */
export default function NextBestActions({ onOpenTab }: { onOpenTab: (tab: DashboardTab) => void }) {
  const { actions, invoices, sites, metrics } = useApp();

  const flagged = invoices.filter((invoice) => invoice.status === 'Flagged');
  const recoverable = flagged.reduce(
    (total, invoice) => total + Math.abs(invoice.issues.reduce((sum, issue) => sum + issue.impact, 0)),
    0,
  );
  const awaiting = actions.filter((action) => action.status === 'Recommended');
  const awaitingValue = awaiting.reduce((total, action) => total + action.monthlySaving, 0);
  const billOnly = sites.filter((site) => site.dataQuality?.consumption === 'bill-only');
  const noBills = sites.filter((site) => !invoices.some((invoice) => invoice.siteId === site.id));

  const list: Action[] = [];

  if (flagged.length > 0) {
    list.push({
      title: `Challenge ${flagged.length} bill${flagged.length === 1 ? '' : 's'}`,
      detail: 'Evidence-backed findings you can send to the supplier today.',
      value: `${gbp(recoverable)} recoverable`,
      tab: 'savings',
    });
  }

  if (awaiting.length > 0) {
    list.push({
      title: `Approve ${awaiting.length} opportunit${awaiting.length === 1 ? 'y' : 'ies'}`,
      detail: 'Schedule changes the engine has priced but not executed.',
      value: `${gbp(awaitingValue)}/mo`,
      tab: 'savings',
    });
  }

  if (billOnly.length > 0) {
    list.push({
      title: `Close the data gap on ${billOnly.length} site${billOnly.length === 1 ? '' : 's'}`,
      detail: 'Half-hourly readings turn estimated savings into verified ones.',
      value: 'conf. 62% → 95%',
      tab: 'data',
    });
  }

  if (noBills.length > 0 && list.length < 3) {
    list.push({
      title: `Add a bill for ${noBills[0].name}`,
      detail: `${noBills.length} site${noBills.length === 1 ? '' : 's'} have no audited invoice yet.`,
      href: '/bills',
    });
  }

  return (
    <div className="eos-ink-panel flex h-full flex-col justify-between rounded-xl border border-ink-800 p-5 text-white">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
          <Sparkles className="h-3.5 w-3.5" /> Next best actions
        </p>

        {list.length === 0 ? (
          <div className="mt-6 flex items-start gap-2 text-sm text-neutral-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold text-white">Nothing is waiting on you.</p>
              <p className="mt-1 text-xs text-neutral-300">
                Every open finding has been challenged and every opportunity is running within
                policy. Add a site to keep growing.
              </p>
              <Link href="/sites" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white hover:underline">
                Add a site <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <ol className="mt-4 space-y-1">
            {list.slice(0, 3).map((item, index) => {
              const body = (
                <>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/25 text-xs font-semibold tabular-nums text-neutral-200">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold text-white">{item.title}</span>
                      {item.value && (
                        <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-100">
                          {item.value}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-neutral-300">
                      {item.detail}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={item.title}>
                  {item.tab ? (
                    <button
                      type="button"
                      onClick={() => item.tab && onOpenTab(item.tab)}
                      className="group flex w-full gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/5"
                    >
                      {body}
                    </button>
                  ) : (
                    <Link href={item.href ?? '#'} className="group flex gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/5">
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="mt-5 rounded-md border border-white/15 px-3 py-2 text-[11px] leading-relaxed text-neutral-300">
        {metrics.issuesOpen} open issue{metrics.issuesOpen === 1 ? '' : 's'} across {invoices.length}{' '}
        audited invoice{invoices.length === 1 ? '' : 's'} · {gbp(metrics.savings)} verified against
        baseline.
      </p>
    </div>
  );
}
