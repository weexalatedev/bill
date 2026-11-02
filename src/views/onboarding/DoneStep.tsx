'use client';
import { ArrowRight, Building2, CheckCircle2, PlugZap } from 'lucide-react';
import { Card } from '../../components/ui';
import { gbp } from '../../lib/format';

/**
 * The final onboarding screen. It summarises what was set up and hands the user
 * to the dashboard — which is where the same prompts live if they skipped.
 */
export default function DoneStep({
  siteCount,
  deviceCount,
  saving,
  onFinish,
}: {
  siteCount: number;
  deviceCount: number;
  /** The saving found by the public bill check, if there was one. */
  saving: number | null;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="bg-ink-900 text-white">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">You&apos;re all set</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
          Your workspace is ready. Upload a bill any time and the audit runs instantly against the
          Ofgem price cap for each site.
        </p>
        <button
          type="button"
          onClick={onFinish}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-emerald-400"
        >
          Go to your dashboard <ArrowRight className="h-4 w-4" />
        </button>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-slate-900">Your setup</p>
        <ul className="mt-3 space-y-3">
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-500/10 text-slate-600">
              <Building2 className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                {siteCount} site{siteCount === 1 ? '' : 's'} connected
              </span>
              <span className="block text-xs text-slate-500">
                {siteCount === 0
                  ? 'You can add one from the Sites page whenever you are ready.'
                  : 'Bills are filed and benchmarked per site.'}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-500/10 text-slate-600">
              <PlugZap className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                {deviceCount} device{deviceCount === 1 ? '' : 's'} connected
              </span>
              <span className="block text-xs text-slate-500">
                {deviceCount === 0
                  ? 'Connect an energy provider or inverter later from Settings.'
                  : 'Live readings feed the audits and the Copilot.'}
              </span>
            </span>
          </li>
        </ul>
        {saving !== null && saving > 0.5 && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Your first audit found {gbp(saving)} of potential savings. Upload the next bill to keep
            the total growing.
          </p>
        )}
      </Card>
    </div>
  );
}
