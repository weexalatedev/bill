import type { ReactNode } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Loader2, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';

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

/** Renders the sign-in UI until authenticated, then the app. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (!auth.isLoaded) return <Splash />;

  if (!auth.isSignedIn) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8">
        <SignIn
          routing="hash"
          signUpUrl={undefined}
          appearance={{ elements: { rootBox: 'mx-auto', card: 'shadow-sm' } }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
