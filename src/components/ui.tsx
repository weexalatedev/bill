'use client';
import { useEffect, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import { cx } from '../lib/cx';

/**
 * The monochrome tone ramp.
 *
 * There is no colour to lean on, so emphasis is expressed as a ladder from
 * black to almost-white:
 *
 *   solid   → ink fill, paper text      (the loudest: a headline figure, a high severity)
 *   outline → paper fill, ink hairline  (assertive but quiet)
 *   muted   → grey fill, no border      (secondary metadata)
 *   ghost   → no fill, grey hairline    (the quietest)
 *
 * Severity, status and sentiment all map onto this one ramp, which is why the
 * old colour names are gone: `solid` means "this matters", not "this is green".
 */
export type Tone = 'solid' | 'outline' | 'muted' | 'ghost';

const badgeTones: Record<Tone, string> = {
  solid: 'border-transparent bg-ink-900 text-white',
  outline: 'border-ink-900/25 bg-white text-ink-900',
  muted: 'border-transparent bg-neutral-100 text-neutral-700',
  ghost: 'border-neutral-200 bg-transparent text-neutral-600',
};

const iconTones: Record<Tone, string> = {
  solid: 'bg-ink-900 text-white',
  outline: 'bg-white text-ink-900 ring-1 ring-inset ring-ink-900/15',
  muted: 'bg-neutral-100 text-neutral-700',
  ghost: 'bg-neutral-50 text-neutral-600',
};

const barTones: Record<Tone, string> = {
  solid: 'bg-ink-900',
  outline: 'bg-neutral-700',
  muted: 'bg-neutral-400',
  ghost: 'bg-neutral-300',
};

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-5',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The paper panel.
 *
 * `tone` is the supported way to change a card's surface: `ink` gives the lit
 * dark panel used for hero numbers, `glass` the frosted variant.
 *
 * There is also a guard: if a caller passes their own background utility (the
 * old `className="bg-ink-900 text-white"` habit), the base `bg-white` is dropped.
 * Without it both classes are emitted and the cascade decides — which is exactly
 * how the audit hero ended up as white text on a white card.
 */
export function Card({
  children,
  className,
  padded = true,
  tone = 'paper',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  tone?: 'paper' | 'ink' | 'glass';
}) {
  const surface =
    tone === 'ink'
      ? 'eos-ink-panel border-ink-800 text-white'
      : tone === 'glass'
        ? 'eos-glass border-neutral-200'
        : 'border-neutral-200 bg-white';
  const callerSetsBackground = typeof className === 'string' && /(^|\s)bg-/.test(className);
  return (
    <div
      className={cx(
        'rounded-xl border',
        callerSetsBackground ? '' : surface,
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A metric tile. The label is a small-caps kicker and the figure is set in the
 * sans face with tabular numerals, so a row of tiles lines up like a ledger.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'solid',
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Optional. Omit for a plain text-only tile. */
  icon?: ReactNode;
  tone?: Tone;
  /** Percentage change; negative is "good" for spend metrics. */
  trend?: { value: number; goodWhenNegative?: boolean };
}) {
  const isGood = trend ? (trend.goodWhenNegative ? trend.value <= 0 : trend.value >= 0) : true;
  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
          {label}
        </p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-ink-900 tabular-nums">
          {value}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          {trend && (
            <span
              className={cx(
                'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
                isGood ? 'text-ink-900' : 'text-neutral-600',
              )}
            >
              {trend.value >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend.value).toFixed(1)}%
            </span>
          )}
          {sub && <span className="truncate text-xs text-neutral-600">{sub}</span>}
        </div>
      </div>
      {icon && (
        <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-lg', iconTones[tone])}>
          {icon}
        </div>
      )}
    </Card>
  );
}

export function ProgressBar({
  value,
  tone = 'solid',
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-neutral-100', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', barTones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-neutral-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}

/**
 * Centred dialog used for the Add-site form.
 *
 * Closes on Escape and on a click that lands on the backdrop itself — `e.target`
 * is compared against the panel so clicks inside the form do not dismiss it.
 * The body is scroll-locked while open so the page behind cannot move.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-8 w-full max-w-2xl animate-fade-in rounded-xl border border-neutral-200 bg-white shadow-xl shadow-ink-950/10"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-ink-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Labelled form control used by the site form. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-ink-900">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-neutral-600">{hint}</span>
      )}
    </label>
  );
}

/** Shared input/select styling so the form fields match the rest of the app. */
export const controlClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 ' +
  'transition-colors placeholder:text-neutral-600 focus:border-ink-900 focus:outline-none ' +
  'focus:ring-2 focus:ring-ink-900/10';
