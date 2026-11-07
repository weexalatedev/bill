'use client';
import { useState } from 'react';
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '../../lib/auth';

const field =
  'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 transition-colors focus:border-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/12';

/**
 * Dev-mode registration. With Clerk configured, Clerk's own <SignUp/> is used and
 * this form never renders; without it, the API keeps a small user table so the
 * whole journey (register → plan → pay → dashboard) is real, not simulated.
 */
export default function DevSignUpForm({ onSuccess }: { onSuccess?: () => void }) {
  const { signUpWithPassword } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signUpWithPassword) return;
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUpWithPassword(email.trim(), password, name.trim() || undefined);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not create that account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-neutral-600">Your name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          placeholder="Sam Carter"
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-neutral-600">Work email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="you@company.co.uk"
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-neutral-600">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
        />
        <span className="mt-1 block text-[11px] text-neutral-600">At least 8 characters.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Create account
      </button>

      <div className="flex items-start gap-2 rounded-md bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Dev auth mode — Clerk is not configured, so accounts are stored by the API itself. Set{' '}
          <code className="rounded bg-neutral-100 px-1">CLERK_PUBLISHABLE_KEY</code> and{' '}
          <code className="rounded bg-neutral-100 px-1">CLERK_SECRET_KEY</code> to use Clerk.
        </span>
      </div>
    </form>
  );
}
