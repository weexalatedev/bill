'use client';
import Link from 'next/link';
import { ArrowLeft, Check, Zap } from 'lucide-react';
import { cx } from '../../lib/cx';

export interface FlowStep {
  /** Short label shown under the progress marker. */
  label: string;
}

/**
 * The shell every phase-wise screen shares: a branded header, a progress rail and
 * a centred column. It is deliberately *not* a tab strip — each step is a full
 * screen of its own, reached by advancing the flow, so the public bill check and
 * the post-signup onboarding read as one continuous journey.
 */
export default function FlowShell({
  steps,
  current,
  title,
  subtitle,
  eyebrow,
  children,
  onBack,
  aside,
  wide = false,
}: {
  steps: FlowStep[];
  /** Zero-based index of the active step. */
  current: number;
  title: string;
  subtitle?: string;
  /** Small uppercase kicker above the title, e.g. "Step 1 of 3". */
  eyebrow?: string;
  children: React.ReactNode;
  /** When provided, a "Back" control is shown in the header. */
  onBack?: () => void;
  /** Right-hand side of the header (e.g. a "Sign in" link). */
  aside?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-sm">
                <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
              </span>
              <span className="text-sm font-bold text-slate-900">EnerOS</span>
            </Link>
          </div>
          {aside}
        </div>

        <nav aria-label="Progress" className="mx-auto max-w-5xl px-4 pb-3 sm:px-6">
          <ol className="flex items-center gap-1.5 sm:gap-2">
            {steps.map((step, index) => {
              const done = index < current;
              const active = index === current;
              return (
                <li key={step.label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                  <span
                    className={cx(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors',
                      done
                        ? 'bg-emerald-600 text-white'
                        : active
                          ? 'bg-ink-900 text-white'
                          : 'bg-slate-200 text-slate-500',
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span
                    className={cx(
                      'hidden truncate text-xs font-medium sm:block',
                      active ? 'text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400',
                    )}
                  >
                    {step.label}
                  </span>
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden
                      className={cx(
                        'h-px flex-1 rounded-full',
                        done ? 'bg-emerald-500/50' : 'bg-slate-200',
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <main className={cx('mx-auto px-4 py-8 sm:px-6', wide ? 'max-w-5xl' : 'max-w-3xl')}>
        <div className="animate-fade-in">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
