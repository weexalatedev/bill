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
    <Card className="border-emerald-200 bg-emerald-50/40">
      <p className="text-sm font-semibold text-slate-900">Finish your setup</p>
      <p className="mt-0.5 text-xs text-slate-500">
        A couple of steps and the console starts working for you.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-emerald-300"
            >
              <span className="flex items-center gap-2">
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                )}
                <span className="text-sm font-semibold text-slate-800">{item.label}</span>
              </span>
              <span className="mt-1 text-xs leading-relaxed text-slate-500">{item.detail}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
