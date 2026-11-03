'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import BrandPanel from './BrandPanel';

/**
 * Split-screen shell shared by the auth routes.
 *
 * The left panel carries the pitch and — deliberately — live numbers: the
 * current Ofgem cap rate, pulled from `/api/analysis/price-cap`, so a prospect
 * can see the product is grounded in real published data before typing an email
 * address. If that call fails the panel still renders; the stat is omitted
 * rather than replaced with a placeholder number.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  /** The Clerk component for this route. */
  children: ReactNode;
  /** "Already have an account?" / "New to EnerOS?" switcher. */
  footer?: ReactNode;
}) {
  const [capLabel, setCapLabel] = useState<{
    label: string;
    averageUnitRateP: number;
    averageStandingChargeP: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPriceCap()
      .then((data) => {
        if (!cancelled) setCapLabel(data.period);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <BrandPanel cap={capLabel} />

      <main className="flex flex-col justify-center px-5 py-10 sm:px-8 lg:px-14">
        <div className="mx-auto w-full max-w-md animate-fade-in">
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
            <p className="mt-1.5 text-sm text-neutral-500">{subtitle}</p>
          </div>

          {children}

          {footer && (
            <div className="mt-6 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-500">
              {footer}
            </div>
          )}

          <p className="mt-8 text-center text-[11px] leading-relaxed text-neutral-400">
            By continuing you agree to EnerOS processing your billing data to produce energy
            analysis. We never sell it, and we never share it with your supplier.
          </p>
        </div>
      </main>
    </div>
  );
}