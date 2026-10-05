import { Link } from 'react-router-dom';
import { Brain, CheckCircle2, FileSearch, Lock, PiggyBank, Zap } from 'lucide-react';
import { pence } from '../../lib/format';

interface CapSummary {
  label: string;
  averageUnitRateP: number;
  averageStandingChargeP: number;
}

/**
 * The dark brand panel on the auth routes. Kept separate from `AuthShell` so the
 * form column stays readable, and so this can be reused on a public marketing
 * route later without dragging the Clerk wiring along.
 */
export default function BrandPanel({ cap }: { cap: CapSummary | null }) {
  return (
    <aside className="relative isolate overflow-hidden bg-ink-900 px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-12">
      {/* Decorative gradient field — pure CSS, no image weight. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            'radial-gradient(60rem 40rem at 10% 0%, rgba(16,185,129,0.28), transparent 60%),' +
            'radial-gradient(45rem 35rem at 90% 100%, rgba(13,148,136,0.30), transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(70% 60% at 30% 20%, black, transparent)',
        }}
      />

      <Link to="/" className="inline-flex w-fit items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/25">
          <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
        </span>
        <span className="leading-tight">
          <span className="block text-base font-bold">EnerOS</span>
          <span className="block text-[11px] text-slate-400">AI Energy Manager</span>
        </span>
      </Link>

      <div className="mt-10 max-w-lg lg:mt-0">
        <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          Every invoice checked.
          <br />
          Every tariff questioned.
          <br />
          <span className="text-emerald-400">Every pound defended.</span>
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          EnerOS audits UK electricity bills against Ofgem's published price cap, flags what you were
          overcharged, and shifts controllable load off the peaks — then proves the saving.
        </p>

        <ul className="mt-8 space-y-4">
          <Proof
            Icon={FileSearch}
            title="Bill auditing with evidence"
            body="Every finding cites its arithmetic and the licence condition behind it."
          />
          <Proof
            Icon={Brain}
            title="Deterministic by design"
            body="A rules engine decides. The AI reads the invoice and explains — it never guesses."
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
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ofgem cap · {cap.label}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight">
              {pence(cap.averageUnitRateP)}
              <span className="ml-1.5 text-sm font-medium text-slate-400">/kWh average</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              + {pence(cap.averageStandingChargeP)}/day standing charge · every invoice is
              benchmarked against your own region.
            </p>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-slate-400">
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
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/10">
        <Icon className="h-4 w-4 text-emerald-400" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{body}</span>
      </span>
    </li>
  );
}