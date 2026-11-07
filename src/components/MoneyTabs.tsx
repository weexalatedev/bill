'use client';
import { useState } from 'react';
import { Receipt, ScanSearch } from 'lucide-react';
import Bills from '../views/Bills';
import Analysis from '../views/Analysis';
import { cx } from '../lib/cx';

type MoneyTab = 'invoices' | 'analysis';

/**
 * The Money screen: invoices and the analysis workbench are one destination.
 *
 * “Invoices” uploads and files a bill; “Smart analysis” is what you do with a
 * bill once you have one, so splitting them across two sidebar entries made the
 * nav longer without adding a concept. `/analysis` stays a working deep link.
 */
export default function MoneyTabs({ initialTab = 'invoices' }: { initialTab?: MoneyTab }) {
  const [tab, setTab] = useState<MoneyTab>(initialTab);

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Money sections"
        className="flex flex-wrap items-center gap-1 rounded-[var(--radius-card)] border border-hairline bg-surface p-1"
      >
        {[
          { id: 'invoices' as const, label: 'Invoices', icon: Receipt },
          { id: 'analysis' as const, label: 'Smart analysis', icon: ScanSearch },
        ].map(({ id, label, icon: Icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setTab(id)}
              className={cx(
                'inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'bg-raised text-text-1 shadow-[var(--eos-card-shadow)]'
                  : 'text-text-2 hover:bg-raised/70 hover:text-text-1',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'invoices' ? <Bills /> : <Analysis />}
    </div>
  );
}
