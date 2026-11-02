'use client';
import { useEffect, useRef, useState } from 'react';
import { SignOutButton, useClerk } from '@clerk/clerk-react';
import { ChevronDown, LogOut, Settings, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { cx } from '../lib/cx';

/**
 * Clerk-only menu actions, split into their own component.
 *
 * `useClerk()` throws when there is no `ClerkProvider` above it, and in
 * dev-auth mode there deliberately is not one. Rendering this component only
 * when `mode === 'clerk'` keeps the hook inside a component that is guaranteed to
 * have a provider above it.
 */
function ClerkMenuActions() {
  const clerk = useClerk();
  return (
    <>
      <button
        type="button"
        onClick={() => void clerk.openUserProfile()}
        className="flex w-full items-center gap-2 border-b border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        <Settings className="h-4 w-4 text-neutral-400" />
        Manage account
      </button>
      <SignOutButton redirectUrl="/sign-in">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <LogOut className="h-4 w-4 text-neutral-400" />
          Sign out
        </button>
      </SignOutButton>
    </>
  );
}

/**
 * Compact account menu — shows who is signed in and allows sign-out.
 *
 * In Clerk mode the sign-out button is Clerk's own `<SignOutButton>`, so the
 * session is actually terminated at the provider and the client is redirected to
 * `afterSignOutUrl` (`/sign-in`). Dev-auth mode falls back to clearing the local
 * token, since there is no remote session to destroy.
 */
export default function UserMenu() {
  const { user, mode, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initials = (user?.name || user?.email || 'E')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const signOutControl =
    mode === 'clerk' ? null : (
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        <LogOut className="h-4 w-4 text-neutral-400" />
        Sign out
      </button>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left hover:bg-neutral-50"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-700">
          {initials}
        </span>
        <span className="hidden max-w-[9rem] truncate text-xs font-medium text-neutral-700 sm:block">
          {user?.name || user?.email}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg shadow-neutral-900/10">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
              <User className="h-3.5 w-3.5 text-neutral-400" />
              {user?.name || 'Signed in'}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{user?.email}</p>
            <p className="mt-1.5">
              <span
                className={cx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                  'bg-neutral-50 text-neutral-700 ring-neutral-600/20',
                )}
              >
                <ShieldCheck className="h-3 w-3" />
                Clerk
              </span>
            </p>
          </div>

          {mode === 'clerk' && <ClerkMenuActions />}
          {signOutControl}
        </div>
      )}
    </div>
  );
}
