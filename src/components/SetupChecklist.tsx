'use client';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Card } from './ui';

/**
 * The dashboard's onboarding nudge. Onboarding is skippable, so the console
 * always re-surfaces the same three steps here until the workspace is set up —
 * site, first bill, devices.
 */
export default function SetupChecklist({
  siteCount,
  invoiceCount,
}: {
  siteCount: number;
  invoiceCount: number;
}) {
  const items = [
    {
      label: 'Add your site',
      detail: 'Bills are filed and benchmarked per site.',
      href: '/sites',
      done: siteCount > 0,
    },
    {
      label: 'Upload your first bill',
      detail: 'PDF or photo — the audit runs instantly.',
      href: '/bills',
      done: invoiceCount > 0,
    },
    {
      label: 'Connect your devices',
      detail: 'Optional — live usage from your provider and inverter.',
      href: '/settings?tab=devices',
      done: false,
    },
  ];

  return (
    <Card className="border-ink-900/20">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
        Finish your setup
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        A couple of steps and the console starts working for you.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group flex h-full flex-col rounded-md border border-neutral-200 bg-white p-4 transition-colors hover:border-ink-900"
            >
              <span className="flex items-center gap-2">
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-ink-900" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-neutral-300" />
                )}
                <span className="text-sm font-semibold text-ink-900">{item.label}</span>
              </span>
              <span className="mt-1 text-xs leading-relaxed text-neutral-600">{item.detail}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-900">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
