'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BatteryCharging,
  Building2,
  CheckCircle2,
  CircuitBoard,
  FileSearch,
  Gauge,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import PlansGrid from '../../components/marketing/PlansGrid';
import { gbp } from '../../lib/format';
import type { PlansResponse } from '../../types';

export default function Landing() {
  const [catalogue, setCatalogue] = useState<PlansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPlans()
      .then(setCatalogue)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the plans just now.'),
      );
  }, []);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-neutral-200">
        <div className="relative mx-auto grid max-w-content gap-10 px-4 py-16 sm:px-6 lg:px-8 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600">
              <Sparkles className="h-3.5 w-3.5" /> Built for UK SMEs
            </p>
            <h1 className="text-text-1 mt-5 text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Stop paying for energy
              <br />
              you never used.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-neutral-600">
              EnerOS reads your bills, checks every line against your contract and a published domestic reference, and
              watches your sites so waste shows up before it reaches your P&amp;L. Start with a
              free bill check — no account needed.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/start"
                className="eos-cta inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold text-white"
              >
                Check your bill free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white/70 px-5 py-3 text-sm font-semibold text-ink-900 backdrop-blur transition-colors hover:bg-white"
              >
                Explore features
              </Link>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600">
              <ShieldCheck className="h-3.5 w-3.5" /> No card to check a bill. Your figures stay
              yours.
            </p>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* ── Value strip ──────────────────────────────────────────────────── */}
      <section className="border-b border-neutral-200 bg-surface">
        <div className="mx-auto grid max-w-content gap-6 px-4 py-10 sm:px-6 lg:px-8 md:grid-cols-3">
          {[
            ['Every bill, checked', 'Unit rate, standing charge, arithmetic and VAT — against the domestic reference for your region.'],
            ['Every £ labelled', 'A saving is either estimated or verified against a baseline. Never an unsupported claim.'],
            ['Every site in one place', 'Sites, meters, invoices and findings, per site, priced per site.'],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <CheckCircle2 className="h-4 w-4" /> {title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <Features />
      <HowItWorks />
      <Pricing catalogue={catalogue} error={error} />
      <FinalCta />
    </>
  );
}

/** Illustrative product vignette — clearly labelled, never a customer claim. */
function HeroVisual() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 p-5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_40px_80px_-40px_rgba(0,0,0,0.55)] backdrop-blur">
        <div className="border-t border-hairline absolute inset-x-0 top-0" aria-hidden />
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-neutral-600">
            Bill audit · illustrative
          </p>
          <span className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold tracking-wide text-white">
            Flagged
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {[
            ['Unit rate vs cap', '2.4p/kWh above the reference rate', true],
            ['Standing charge', 'Matches the contracted rate', false],
            ['Arithmetic', 'Consumption × rate reconciles', false],
            ['VAT', 'Charged at 20% on the platform fee', false],
          ].map(([title, detail, flagged]) => (
            <div
              key={String(title)}
              className="flex items-start gap-3 rounded-md border border-neutral-200 px-3 py-2.5"
            >
              <span
                className={
                  flagged
                    ? 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-900 text-[10px] font-semibold text-white'
                    : 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-neutral-300 text-[10px] text-neutral-600'
                }
              >
                {flagged ? '!' : '✓'}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{String(title)}</p>
                <p className="truncate text-xs text-neutral-600">{String(detail)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-md bg-neutral-50 px-3 py-3">
          <div>
            <p className="text-[11px] tracking-wide text-neutral-600">Recoverable</p>
            <p className="text-lg font-semibold tabular-nums text-ink-900">{gbp(412)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] tracking-wide text-neutral-600">Confidence</p>
            <p className="text-sm font-semibold text-ink-900">Deterministic</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm sm:block">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-700">
          <Zap className="h-3.5 w-3.5" /> Priced off the live Agile curve
        </p>
      </div>
    </div>
  );
}

export const FEATURES = [
  {
    icon: FileSearch,
    title: 'Bill auditing that finds the errors',
    body: 'Ten deterministic checks per invoice: charged rate vs your contracted rate and the published domestic reference for your region, standing-charge days, arithmetic, VAT treatment and meter-read continuity. Evidence for every finding.',
  },
  {
    icon: Gauge,
    title: 'Live UK prices and carbon',
    body: 'The real half-hourly Agile Octopus curve for your distribution region, the cheapest and peak windows today, and GB grid carbon intensity — no keys, no guesses.',
  },
  {
    icon: TrendingDown,
    title: 'Smart Analysis against the cap',
    body: 'Every bill benchmarked against the published price cap and your own history, so “normal” becomes a number you can act on rather than a feeling.',
  },
  {
    icon: CircuitBoard,
    title: 'Real half-hourly meter data',
    body: 'Import half-hourly consumption from a CSV, with a data-quality report, overnight base load, peak demand, anomalies and a baseline-versus-recent verified saving.',
  },
  {
    icon: MessageSquare,
    title: 'A Copilot grounded in your numbers',
    body: 'The server computes the figures; the assistant explains them. When the AI is not configured it says so plainly instead of inventing an answer.',
  },
  {
    icon: BatteryCharging,
    title: 'Optimiser with approval built in',
    body: 'Recommended actions with schedule changes, model confidence and £ savings, and a Recommend → Approve → Automate ladder you control. Nothing runs without permission.',
  },
  {
    icon: Building2,
    title: 'Multi-site portfolio',
    body: 'Every invoice, action and finding is filed per site — with data quality per site, so you know which numbers are measured and which are bill-only.',
  },
  {
    icon: ShieldCheck,
    title: 'Connections you can pause',
    body: 'Connect Octopus or a Solis inverter once per site, see readiness and yesterday’s findings, and pause a feed at any time.',
  },
] as const;

function Features() {
  return (
    <section id="features" className="border-b border-neutral-200">
      <div className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold tracking-wide text-neutral-600">Features</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
          Everything here is already running
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
          No roadmap promises: these are the capabilities in the product today. If it is not
          built, it is not on this page.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-neutral-200 bg-raised p-5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-ink-900 transition-colors group-hover:border-ink-900/20">
                <Icon className="h-4 w-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-ink-900">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: 'Check a bill — free, no account',
    body: 'Upload a PDF or photo, or type the figures. We price the same usage at the UK reference rate and show what you could save. Nothing is stored until you choose to create an account.',
    href: '/start',
    cta: 'Check a bill',
  },
  {
    title: 'Create your account',
    body: 'Your audit is saved to your first site and re-checked against every future bill. No card at this point — an account is not a subscription.',
    href: '/sign-up',
    cta: 'Create an account',
  },
  {
    title: 'Choose your plan and pay',
    body: 'Pick Starter, Growth or Autonomous and pay per site, per month. The dashboard opens only after the payment is verified by our server — never from a browser flag.',
    href: '/pricing',
    cta: 'See pricing',
  },
  {
    title: 'Run your sites',
    body: 'Upload bills, import half-hourly data, approve savings actions and watch the verified £ accumulate. Add sites up to your plan’s limit; upgrade whenever you need more.',
    href: '/dashboard',
    cta: 'Open the dashboard',
  },
] as const;

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden border-b border-neutral-200 bg-neutral-50/70">
      <div className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold tracking-wide text-neutral-600">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
          Prove the saving first, subscribe second
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
          The funnel is deliberately in this order: see the money, then create an account, then
          choose a plan. You should never be asked to pay before you have seen an audit.
        </p>

        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-white tabular-nums">
                {index + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-ink-900">{step.title}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-neutral-600">{step.body}</p>
              <Link
                href={step.href}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900 hover:underline"
              >
                {step.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pricing({ catalogue, error }: { catalogue: PlansResponse | null; error: string | null }) {
  return (
    <section id="pricing" className="border-b border-neutral-200">
      <div className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold tracking-wide text-neutral-600">Pricing</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
          Priced per site, per month
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
          No seats, no setup fee. Every plan includes bill auditing; the higher tiers add
          half-hourly analysis, verified savings reports and, at the top, approved automation.
        </p>

        <div className="mt-8">
          {error && (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
              We could not load live pricing just now. The plans start at £49 per site per month —{' '}
              <Link href="/pricing" className="font-semibold text-ink-900 underline">
                try the pricing page
              </Link>
              .
            </div>
          )}
          {!error && !catalogue && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-16 text-sm text-neutral-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          )}
          {catalogue && (
            <PlansGrid
              plans={catalogue.plans}
              annualAvailable={catalogue.annualBillingAvailable}
              recommendedId={catalogue.recommendedPlanId}
              ctaHref="/start"
              footnote={
                catalogue.siteLimitSource === 'provisional'
                  ? 'Site caps per plan are provisional commercial settings; pricing follows the README (per site, per month).'
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
      <div className="eos-ink-panel relative overflow-hidden rounded-2xl px-6 py-12 text-white sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="max-w-2xl">
          <h2 className="text-[#f5f5f4] text-3xl font-semibold tracking-tight sm:text-4xl">
            Start with the bill in your hand.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            One bill is enough to see what EnerOS finds. Create an account when you want it saved,
            watched and verified — and choose a plan when you are ready to run your sites on it.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/start"
              className="eos-cta-light inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold"
            >
              Check your bill free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
