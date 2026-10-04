import { useState, type ReactNode } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Loader2, LogIn, Zap } from 'lucide-react';
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

/** Dev-mode sign-in form — used only when Clerk is not configured. */
function DevSignIn() {
  const { config, signInWithPassword } = useAuth();
  const [email, setEmail] = useState(config.demo.email);
  const [password, setPassword] = useState(config.demo.password ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signInWithPassword) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600">
            <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">EnerOS</p>
            <p className="text-xs text-slate-500">Sign in to your energy console</p>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        {error && (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Sign in
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          Dev auth mode — Clerk is not configured. The demo credentials above open the
          seeded workspace, and are the same on web and mobile.
        </p>
      </form>
    </div>
  );
}

/** Renders the sign-in UI until authenticated, then the app. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (!auth.isLoaded) return <Splash />;

  if (!auth.isSignedIn) {
    if (auth.mode === 'clerk') {
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
    return <DevSignIn />;
  }

  return <>{children}</>;
}
