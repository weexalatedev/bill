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
      <Card tone="ink" className="overflow-hidden">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">You&apos;re all set</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-300">
          Your workspace is ready. Upload a bill any time and the audit runs instantly against the
          your contract and the published domestic reference for each site.
        </p>
        <button
          type="button"
          onClick={onFinish}
          className="eos-cta-light mt-5 inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold"
        >
          Go to your dashboard <ArrowRight className="h-4 w-4" />
        </button>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-neutral-900">Your setup</p>
        <ul className="mt-3 space-y-3">
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
              <Building2 className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-800">
                {siteCount} site{siteCount === 1 ? '' : 's'} connected
              </span>
              <span className="block text-xs text-neutral-600">
                {siteCount === 0
                  ? 'You can add one from the Sites page whenever you are ready.'
                  : 'Bills are filed and benchmarked per site.'}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
              <PlugZap className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-800">
                {deviceCount} device{deviceCount === 1 ? '' : 's'} connected
              </span>
              <span className="block text-xs text-neutral-600">
                {deviceCount === 0
                  ? 'Connect an energy provider or inverter later from Settings.'
                  : 'Live readings feed the audits and the Copilot.'}
              </span>
            </span>
          </li>
        </ul>
        {saving !== null && saving > 0.5 && (
          <p className="mt-4 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800">
            Your first audit found {gbp(saving)} of potential savings. Upload the next bill to keep
            the total growing.
          </p>
        )}
      </Card>
    </div>
  );
}
