'use client';
import type { ReactNode } from 'react';
import { ClerkLoaded, ClerkLoading as ClerkIsLoading } from '@clerk/clerk-react';
import { Loader2, Zap } from 'lucide-react';

/**
 * Wraps Clerk's hosted components so the layout does not jump while the session
 * is being initialised from the publishable key.
 *
 * Clerk's `<ClerkLoaded>` renders its children once the instance is ready and
 * `<ClerkLoading>` while it is not; showing the branded splash in the second
 * case keeps the sign-in card's position stable instead of flashing an empty
 * column.
 */
export function ClerkGate({ children }: { children: ReactNode }) {
  return (
    <>
      <ClerkLoaded>{children}</ClerkLoaded>
      <ClerkIsLoading>
        <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
          </div>
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting to EnerOS…
          </p>
        </div>
      </ClerkIsLoading>
    </>
  );
}

/** Shown when Clerk cannot initialise at all — usually a missing publishable key. */
export function ClerkFailed({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
      <p className="text-sm font-semibold text-rose-800">Authentication is unavailable</p>
      <p className="mt-1.5 text-xs leading-relaxed text-rose-700/90">
        {children ??
          'Clerk could not initialise. This usually means the publishable key is missing or the API is unreachable.'}
      </p>
    </div>
  );
}