import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cx } from '../lib/cx';

export type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' | 'violet';

const badgeTones: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

const iconTones: Record<Tone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600',
  amber: 'bg-amber-500/10 text-amber-600',
  rose: 'bg-rose-500/10 text-rose-600',
  sky: 'bg-sky-500/10 text-sky-600',
  slate: 'bg-slate-500/10 text-slate-600',
  violet: 'bg-violet-500/10 text-violet-600',
};

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]',
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
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'emerald',
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone?: Tone;
  /** Percentage change; negative is "good" for spend metrics. */
  trend?: { value: number; goodWhenNegative?: boolean };
}) {
  const isGood = trend ? (trend.goodWhenNegative ? trend.value <= 0 : trend.value >= 0) : true;
  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        <div className="mt-1 flex items-center gap-2">
          {trend && (
            <span
              className={cx(
                'inline-flex items-center gap-0.5 text-xs font-semibold',
                isGood ? 'text-emerald-600' : 'text-rose-600',
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
          {sub && <span className="truncate text-xs text-slate-400">{sub}</span>}
        </div>
      </div>
      <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', iconTones[tone])}>
        {icon}
      </div>
    </Card>
  );
}

export function ProgressBar({
  value,
  tone = 'emerald',
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const barTones: Record<Tone, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
    slate: 'bg-slate-400',
    violet: 'bg-violet-500',
  };
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', barTones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}