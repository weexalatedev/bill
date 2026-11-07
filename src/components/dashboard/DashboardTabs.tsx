'use client';
import { cx } from '../../lib/cx';

export type DashboardTab = 'overview' | 'savings' | 'devices' | 'data';

const TABS: { id: DashboardTab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Spend, baseline and the money at stake' },
  { id: 'savings', label: 'Savings', hint: 'Identified, awaiting approval, automated' },
  { id: 'devices', label: 'Devices', hint: 'Connected hardware and controllable loads' },
  { id: 'data', label: 'Data', hint: 'Coverage per site and what to add next' },
];

/**
 * The dashboard's own tab strip.
 *
 * Tabs are ordered by the plan's loop — observe (overview), diagnose (savings),
 * act (devices), and the data that makes all of it true. Counts are live, so a
 * tab with work waiting says so before you open it.
 */
export default function DashboardTabs({
  active,
  onChange,
  counts,
}: {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
  counts: Partial<Record<DashboardTab, number>>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50/80 p-1"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const count = counts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            title={tab.hint}
            onClick={() => onChange(tab.id)}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              selected
                ? 'bg-white text-ink-900 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_6px_16px_-12px_rgba(0,0,0,0.5)]'
                : 'text-neutral-600 hover:bg-white/70 hover:text-ink-900',
            )}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={cx(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                  selected ? 'bg-ink-900 text-white' : 'bg-neutral-200 text-neutral-700',
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
