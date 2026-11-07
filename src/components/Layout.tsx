'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CreditCard,
  Database,
  Info,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageSquare,
  Receipt,
  RefreshCw,
  ScanSearch,
  Settings as SettingsIcon,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { gbp } from '../lib/format';
import { Badge } from './ui';
import UserMenu from './UserMenu';
import { useApp } from '../store';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: 'issues';
}

/**
 * Navigation follows the plan's loop: observe (dashboard), act (savings), pay
 * (invoices), understand (analysis), organise (sites), measure (data), price
 * (live market), ask (copilot), and administer.
 */
interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grouped the way the product is used: the loop (overview, savings), the money
 * (bills and their analysis), operations (sites, devices, data, market), then
 * the assistant and the account. Four groups beat ten flat rows.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/optimiser', label: 'Savings', icon: TrendingDown },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/bills', label: 'Invoices', icon: Receipt, badge: 'issues' },
      { to: '/analysis', label: 'Smart Analysis', icon: ScanSearch },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/sites', label: 'Sites', icon: Building2 },
      { to: '/data', label: 'Meter data', icon: Database },
      { to: '/live', label: 'Live market', icon: Activity },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/copilot', label: 'Copilot', icon: MessageSquare },
      { to: '/subscription', label: 'Subscription', icon: CreditCard },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'Your energy at a glance — spend, savings and open issues.',
  },
  '/optimiser': {
    title: 'Savings',
    subtitle: 'Opportunities the engine has priced — approve, automate or dismiss.',
  },
  '/data': {
    title: 'Meter data',
    subtitle: 'Import half-hourly readings and see what they unlock.',
  },
  '/live': {
    title: 'Live market',
    subtitle: 'Real half-hourly UK prices, cheapest windows and grid carbon.',
  },
  '/copilot': {
    title: 'Copilot',
    subtitle: 'Ask about your own numbers — the engine computes, the model explains.',
  },
  '/bills': {
    title: 'Invoices',
    subtitle: 'Upload a bill — we read it, audit it, and file it against the right site.',
  },
  '/analysis': {
    title: 'Smart Analysis',
    subtitle: 'Benchmark any bill against your contract and a domestic reference rate.',
  },
  '/sites': {
    title: 'Sites',
    subtitle: 'Add your sites — invoices are filed and benchmarked per site.',
  },
  '/subscription': {
    title: 'Subscription',
    subtitle: 'Plan, capacity, payments and changes — straight from your billing record.',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Devices, rate plan, hardware and pause switches — wired to the connector service.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { sites, invoices, metrics, toast, loading, error, refresh } = useApp();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const meta = PAGE_META[pathname] ?? PAGE_META['/dashboard'];
  /** The Copilot owns the viewport height: a chat app should not page-scroll. */
  const isChat = pathname === '/copilot';

  /** Open issues drive the notifications panel — the only live alerts we have. */
  const flaggedInvoices = invoices.filter((invoice) => invoice.status === 'Flagged');

  // First load: the workspace is still coming back from MongoDB.
  if (loading && sites.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-100">
        <div className="flex flex-col items-center gap-3 text-neutral-500">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-ink-900">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
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
      <div className="grid min-h-screen place-items-center bg-neutral-100 px-4">
        <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-6 w-6 text-neutral-500" />
          <p className="mt-2 text-sm font-semibold text-neutral-800">Could not load your data</p>
          <p className="mt-1 text-xs text-neutral-500">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const badgeCount: Record<string, number | undefined> = {
    issues: metrics.issuesOpen,
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-neutral-400">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-white">
          <Zap className="h-[18px] w-[18px] text-ink-900" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-white">EnerOS</p>
          <p className="text-[11px] text-neutral-500">AI Energy Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-neutral-500">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const count = item.badge ? badgeCount[item.badge] : undefined;
              const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cx(
                    'group flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-white font-semibold text-ink-900'
                      : 'font-medium text-neutral-400 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon
                    className={cx(
                      'h-[18px] w-[18px]',
                      isActive ? 'text-ink-900' : 'text-neutral-500 group-hover:text-white',
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {count !== undefined && count > 0 && (
                    <span
                      className={cx(
                        'rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                        isActive ? 'bg-accent text-white' : 'bg-white/10 text-neutral-300',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <div className={cx('flex bg-neutral-100', isChat ? 'h-[100dvh] overflow-hidden' : 'min-h-screen')}>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 animate-fade-in">{sidebar}</div>
        </div>
      )}

      <div className={cx('flex min-w-0 flex-1 flex-col', isChat && 'min-h-0')}>
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 text-neutral-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink-900">
                {meta.title}
              </h1>
              <p className="hidden truncate text-xs text-neutral-500 sm:block">{meta.subtitle}</p>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((open) => !open)}
                className="relative grid h-9 w-9 place-items-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50"
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <Bell className="h-[18px] w-[18px]" />
                {metrics.issuesOpen > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-ink-900 text-[10px] font-semibold text-white tabular-nums">
                    {metrics.issuesOpen}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  {/* Click-away layer — a full-screen transparent backdrop, so
                      the panel can be dismissed without a listener. */}
                  <button
                    type="button"
                    aria-label="Close notifications"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-80 animate-fade-in overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl shadow-ink-950/10">
                    <div className="border-b border-neutral-200 px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-800">Notifications</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {flaggedInvoices.length === 0
                          ? 'Nothing needs your attention.'
                          : `${flaggedInvoices.length} invoice${
                              flaggedInvoices.length > 1 ? 's' : ''
                            } flagged by the auditor.`}
                      </p>
                    </div>

                    {flaggedInvoices.length === 0 ? (
                      <p className="px-4 py-8 text-center text-xs text-neutral-400">
                        No open issues.
                      </p>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto">
                        {flaggedInvoices.map((invoice) => {
                          const siteName =
                            sites.find((s) => s.id === invoice.siteId)?.name ?? invoice.siteId;
                          return (
                            <li key={invoice.id} className="border-b border-neutral-50 last:border-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setNotifOpen(false);
                                  router.push('/bills');
                                }}
                                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-neutral-800">
                                    {invoice.id} · {siteName}
                                  </p>
                                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                                    {invoice.issues.length} issue
                                    {invoice.issues.length > 1 ? 's' : ''} · {invoice.supplier}
                                  </p>
                                </div>
                                <Badge tone="solid" className="shrink-0">
                                  {gbp(invoice.total)}
                                </Badge>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="border-t border-neutral-100 bg-neutral-50/70 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          router.push('/bills');
                        }}
                        className="text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-900"
                      >
                        Open the Bill Auditor →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <UserMenu />
          </div>
        </header>

        <main
          className={cx(
            'mx-auto w-full max-w-wide flex-1',
            isChat ? 'flex min-h-0 flex-col overflow-hidden' : 'px-4 py-6 sm:px-6 lg:px-8',
          )}
        >
          {children}
        </main>

        {!isChat && (
          <footer className="border-t border-neutral-200 px-4 py-4 text-center text-xs text-neutral-400 sm:px-6">
            EnerOS · the autonomous energy manager for UK SMEs
          </footer>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 animate-fade-in">
          <div className="flex items-start gap-3 rounded-lg bg-accent px-4 py-3 text-sm text-white shadow-xl shadow-neutral-900/20">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <p className="flex-1">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}