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
    <div className="min-h-screen bg-neutral-50">
      <header className="eos-glass sticky top-0 z-20 border-b border-neutral-200/70">
        <div className="mx-auto flex w-full max-w-funnel items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="grid h-8 w-8 place-items-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <Zap className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold tracking-tight text-ink-900">EnerOS</span>
            </Link>
          </div>
          {aside}
        </div>

        <nav aria-label="Progress" className="mx-auto w-full max-w-funnel px-4 pb-3 sm:px-6 lg:px-8">
          <ol className="flex items-center gap-1.5 sm:gap-2">
            {steps.map((step, index) => {
              const done = index < current;
              const active = index === current;
              return (
                <li key={step.label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                  <span
                    className={cx(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors tabular-nums',
                      done
                        ? 'border-ink-900 bg-white text-ink-900'
                        : active
                          ? 'border-ink-900 bg-ink-900 text-white shadow-[0_6px_18px_-10px_rgba(0,0,0,0.8)]'
                          : 'border-transparent bg-neutral-100 text-neutral-600',
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span
                    className={cx(
                      'hidden truncate text-xs sm:block',
                      active
                        ? 'font-semibold text-ink-900'
                        : done
                          ? 'font-medium text-neutral-600'
                          : 'font-medium text-neutral-600',
                    )}
                  >
                    {step.label}
                  </span>
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden
                      className={cx('h-px flex-1', done ? 'bg-ink-900' : 'bg-neutral-200')}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <main className={cx('mx-auto w-full px-4 py-8 sm:px-6 lg:px-8', wide ? 'max-w-content' : 'max-w-funnel')}>
        <div className="animate-fade-in">
          {eyebrow && (
            <p className="text-xs font-semibold tracking-wide text-neutral-600">
              {eyebrow}
            </p>
          )}
          <h1 className="text-text-1 mt-1 text-2xl font-semibold tracking-tight sm:text-[32px]">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-neutral-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
