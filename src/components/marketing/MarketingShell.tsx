'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Zap } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#contact', label: 'Contact' },
];

/**
 * The public shell: identical chrome on every unauthenticated page. Kept
 * separate from the console Layout so marketing pages never mount app state.
 */
export default function MarketingShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <header className="eos-glass sticky top-0 z-40 border-b border-neutral-200/70">
        <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="EnerOS home">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-ink-900">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">EnerOS</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link
              href="/sign-in"
              className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
            >
              Login
            </Link>
            <Link
              href="/start"
              className="eos-cta rounded-md px-4 py-2 text-sm font-semibold text-white"
            >
              Get started
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="ml-auto grid h-9 w-9 place-items-center rounded-md border border-neutral-200 text-neutral-700 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-neutral-200 bg-white px-4 py-3 md:hidden">
            <nav className="flex flex-col" aria-label="Mobile">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2.5 text-sm font-medium text-neutral-700"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex gap-2">
                <Link
                  href="/sign-in"
                  className="flex-1 rounded-md border border-neutral-200 px-3 py-2 text-center text-sm font-semibold text-neutral-700"
                >
                  Login
                </Link>
                <Link
                  href="/start"
                  className="flex-1 rounded-md bg-accent px-3 py-2 text-center text-sm font-semibold text-white"
                >
                  Get started
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer id="contact" className="border-t border-neutral-200 bg-surface">
        <div className="mx-auto grid max-w-content gap-8 px-4 py-12 sm:px-6 lg:px-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-ink-900">
                <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">EnerOS</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-600">
              The autonomous energy manager for Britain&apos;s small and medium businesses.
              Audit every bill, find the waste, and prove the savings — per site, per year.
            </p>
            <p className="mt-4 text-sm text-neutral-600">
              <a
                href="mailto:hello@eneros.app"
                className="font-medium text-neutral-800 underline-offset-4 hover:underline"
              >
                hello@eneros.app
              </a>
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-600">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-600">
              <li><Link href="/features" className="hover:text-neutral-900">Features</Link></li>
              <li><Link href="/pricing" className="hover:text-neutral-900">Pricing</Link></li>
              <li><Link href="/methodology" className="hover:text-neutral-900">Methodology</Link></li>
              <li><Link href="/start" className="hover:text-neutral-900">Free bill check</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-neutral-900">How it works</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-600">Account</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-600">
              <li><Link href="/sign-in" className="hover:text-neutral-900">Login</Link></li>
              <li><Link href="/sign-up" className="hover:text-neutral-900">Create an account</Link></li>
              <li><Link href="/sign-in" className="hover:text-neutral-900">Dashboard</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-200">
          <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-5 text-xs text-neutral-600 sm:flex-row sm:items-center sm:px-6">
            <p>© {new Date().getFullYear()} EnerOS Ltd. Registered in England &amp; Wales.</p>
            <p className="sm:ml-auto">
              <Link href="/terms" className="hover:text-neutral-800">Terms</Link>
              <span className="px-2">·</span>
              <Link href="/privacy" className="hover:text-neutral-800">Privacy</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
