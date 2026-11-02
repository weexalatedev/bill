'use client';
import { useState } from 'react';
import { AlertTriangle, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../../lib/auth';

/**
 * The demo sign-in form, used when the API reports `authMode: 'dev'` (Clerk is
 * not configured). In that mode there is no Clerk session, so `/sign-in` and
 * `/sign-up` render this instead of Clerk's hosted components — which keeps the
 * whole acquisition flow usable locally without any keys.
 */
export default function DevSignInForm({ onSuccess }: { onSuccess?: () => void }) {
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
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Sign in
      </button>

      <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Dev auth mode — Clerk is not configured on the API, so this demo login is shown instead of
          the real sign-up and login screens. Set{' '}
          <code className="rounded bg-amber-100 px-1">CLERK_PUBLISHABLE_KEY</code> and{' '}
          <code className="rounded bg-amber-100 px-1">CLERK_SECRET_KEY</code> to switch.
        </span>
      </div>
    </form>
  );
}
