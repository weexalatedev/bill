'use client';
import Link from 'next/link';
import { Brain, FileSearch, Lock, PiggyBank, Zap } from 'lucide-react';
import { pence } from '../../lib/format';

interface CapSummary {
  label: string;
  averageUnitRateP: number;
  averageStandingChargeP: number;
}

/**
 * The ink panel on the auth routes.
 *
 * It is deliberately flat: no gradient, no glow, no colour. The panel carries
 * the pitch through type and rule-work alone, which keeps the form column calm
 * and makes the live Ofgem figures the only thing that moves.
 */
export default function BrandPanel({ cap }: { cap: CapSummary | null }) {
  return (
    <aside className="relative isolate flex flex-col justify-between overflow-hidden bg-ink-950 px-6 py-10 text-white sm:px-10 lg:border-r lg:border-white/10 lg:py-12">
      <Link href="/" className="inline-flex w-fit items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-white">
          <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
        </span>
        <span className="leading-tight">
          <span className="block text-base font-semibold tracking-tight">EnerOS</span>
          <span className="block text-[11px] text-neutral-500">AI Energy Manager</span>
        </span>
      </Link>

      <div className="mt-10 max-w-lg lg:mt-0">
        <h2 className="text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[32px]">
          Every invoice checked.
          <br />
          Every tariff questioned.
          <br />
          <span className="text-neutral-500">Every pound defended.</span>
        </h2>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-neutral-400">
          EnerOS audits UK electricity bills against Ofgem&apos;s published price cap, flags what you
          were overcharged, and shifts controllable load off the peaks — then proves the saving.
        </p>

        <ul className="mt-9 space-y-4">
          <Proof
            Icon={FileSearch}
            title="Bill auditing with evidence"
            body="Every finding cites its arithmetic and the licence condition behind it."
          />
          <Proof
            Icon={Brain}
            title="Deterministic by design"
            body="A rules engine decides. The model reads the invoice and explains — it never guesses."
          />
          <Proof
            Icon={PiggyBank}
            title="Savings you can verify"
            body="Baseline, intervention, outcome — measured, not modelled."
          />
        </ul>
      </div>

      <div className="mt-10 space-y-5 lg:mt-0">
        {cap && (
          <div className="border-t border-white/15 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Ofgem cap · {cap.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {pence(cap.averageUnitRateP)}
              <span className="ml-2 text-sm font-normal text-neutral-500">/kWh average</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              + {pence(cap.averageStandingChargeP)}/day standing charge · every invoice is
              benchmarked against your own region.
            </p>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-neutral-600">
          <Lock className="h-3.5 w-3.5" />
          Authentication by Clerk · documents encrypted at rest in Cloudflare R2
        </p>
      </div>
    </aside>
  );
}

function Proof({ Icon, title, body }: { Icon: typeof Zap; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/15">
        <Icon className="h-4 w-4 text-neutral-300" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">{body}</span>
      </span>
    </li>
  );
}
