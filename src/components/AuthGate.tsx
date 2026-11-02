'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';

/**
 * The single gate in front of the console.
 *
 * Signed-out visitors are sent to the acquisition flow at `/start` (check a bill
 * → see the saving → create an account) rather than straight to a login form.
 * The auth screens themselves are real routes (`/sign-in`, `/sign-up`), reached
 * from inside that flow.
 */

/** Full-screen splash shown while auth + config resolve. */
function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Connecting to EnerOS…
        </p>
      </div>
    </div>
  );
}

/** Gates the console routes behind a valid session. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    router.replace('/start');
  }, [isLoaded, isSignedIn, router]);

  if (isSignedIn) return <>{children}</>;
  return <Splash />;
}
