'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, LogIn, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';

/**
 * The single gate in front of the console.
 *
 * In Clerk mode this no longer renders a sign-in form — the auth screens are
 * real routes (`/sign-in`, `/sign-up`) so they can be linked to, bookmarked and
 * refreshed safely. The gate's only job is to bounce signed-out visitors to
 * `/sign-in` while remembering where they were heading.
 *
 * Dev-auth mode (no Clerk keys on the API) still needs an inline form, because
 * there is no Clerk session to redirect to.
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

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Dev auth mode — Clerk is not configured on the API, so this demo login is shown
            instead of the real sign-up and login screens. Set{' '}
            <code className="rounded bg-amber-100 px-1">CLERK_PUBLISHABLE_KEY</code> and{' '}
            <code className="rounded bg-amber-100 px-1">CLERK_SECRET_KEY</code> to switch.
          </span>
        </div>
      </form>
    </div>
  );
}

/** Gates the console routes behind a valid session. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { mode, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoaded || isSignedIn || mode !== 'clerk') return;
    router.replace('/sign-in');
  }, [isLoaded, isSignedIn, mode, router]);

  if (!isLoaded) return <Splash />;
  if (isSignedIn) return <>{children}</>;

  // Clerk mode → the real auth route. Dev mode → inline form (no Clerk session exists).
  if (mode === 'clerk') return <Splash />;
  return <DevSignIn />;
}
