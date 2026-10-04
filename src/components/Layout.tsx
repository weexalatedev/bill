import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Bot,
  Building2,
  CreditCard,
  LayoutDashboard,
  Loader2,
  Menu,
  Radio,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { cx } from '../lib/cx';
import UserMenu from './UserMenu';
import { useApp } from '../store';

interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  badge?: 'issues' | 'savings';
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', hint: 'Module A', icon: LayoutDashboard },
  { to: '/bills', label: 'Bill Auditor', hint: 'Module B', icon: Receipt, badge: 'issues' },
  { to: '/optimiser', label: 'Optimiser', hint: 'Module C', icon: Sparkles, badge: 'savings' },
  { to: '/sites', label: 'Sites', hint: 'Layer 1 · Data OS', icon: Building2 },
  { to: '/copilot', label: 'Copilot', hint: 'AI Energy Brain', icon: Bot },
  { to: '/plans', label: 'Plans & Billing', hint: 'Subscription', icon: CreditCard },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Energy Intelligence',
    subtitle: 'What will we consume, what will it cost, what should we change?',
  },
  '/bills': {
    title: 'AI Bill Auditor',
    subtitle: 'Every invoice checked for incorrect charges, anomalies and tariff issues.',
  },
  '/optimiser': {
    title: 'Energy Optimiser',
    subtitle: 'Recommended actions with verified savings — approve, then automate.',
  },
  '/sites': {
    title: 'Sites',
    subtitle: 'Controllable assets and performance across the portfolio.',
  },
  '/copilot': { title: 'EnerOS Copilot', subtitle: 'Ask anything about your energy spend.' },
  '/plans': {
    title: 'Plans & Billing',
    subtitle: 'Your subscription, performance fee and forecast.',
  },
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { account, sites, metrics, toast, controlMode, loading, error, refresh } = useApp();
  const location = useLocation();
  const meta = PAGE_META[location.pathname] ?? PAGE_META['/'];

  // First load: the workspace is still coming back from MongoDB.
  if (loading && sites.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600">
            <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
          </div>
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your energy workspace…
          </p>
        </div>
      </div>
    );
  }

  // API unreachable after boot (e.g. the backend restarted).
  if (error && sites.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Could not load your data</p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const badgeCount: Record<string, number | undefined> = {
    issues: metrics.issuesOpen,
    savings: metrics.potentialMonthlySaving,
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">EnerOS</p>
          <p className="text-[11px] text-slate-400">AI Energy Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const count = item.badge ? badgeCount[item.badge] : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-500/10 text-white ring-1 ring-inset ring-emerald-500/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cx(
                      'h-[18px] w-[18px]',
                      isActive ? 'text-emerald-400' : 'text-slate-500',
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      {item.badge === 'savings' ? `£${count}` : count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            Live · Half-hourly
          </span>
        </div>
        <p className="mt-1.5 text-xs font-medium text-white">{account.name}</p>
        <p className="text-[11px] text-slate-400">
          {account.sites} sites · {account.planId} plan
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 animate-fade-in">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">
                {meta.title}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{meta.subtitle}</p>
            </div>

            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 md:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="search"
                placeholder="Search sites, invoices…"
                className="w-40 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none lg:w-56"
              />
            </div>

            <span
              className={cx(
                'hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset sm:inline-flex',
                controlMode === 'Automate'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                  : controlMode === 'Approve'
                    ? 'bg-sky-50 text-sky-700 ring-sky-600/20'
                    : 'bg-amber-50 text-amber-700 ring-amber-600/20',
              )}
            >
              {controlMode} mode
            </span>

            <button
              type="button"
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              {metrics.issuesOpen > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {metrics.issuesOpen}
                </span>
              )}
            </button>

            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400 sm:px-6">
          EnerOS · MongoDB · Clerk auth · Cloudflare R2 storage · the autonomous energy manager for
          UK SMEs
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 animate-fade-in">
          <div className="flex items-start gap-3 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-xl shadow-slate-900/20">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="flex-1">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}