/**
 * Clerk appearance — one place so the hosted Clerk components match the EnerOS
 * chrome on every screen (auth pages, and the user button in the header).
 *
 * The values mirror `src/index.css`: emerald/teal for action, deep ink for
 * text. Tailwind classes are passed through as strings because Clerk applies
 * them to its own shadow DOM-less markup inside our React tree.
 */

export const clerkAppearance = {
  variables: {
    colorPrimary: '#059669',
    colorBackground: '#ffffff',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorInputBackground: '#f8fafc',
    colorInputText: '#0f172a',
    colorInputPlaceholder: '#94a3b8',
    colorDanger: '#e11d48',
    borderRadius: '0.75rem',
    fontFamily:
      "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  elements: {
    rootBox: 'mx-auto w-full',
    cardBox: 'w-full max-w-md rounded-2xl',
    card: 'rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/[0.06] sm:p-8',
    headerTitle: 'text-xl font-bold tracking-tight text-slate-900',
    headerSubtitle: 'text-sm text-slate-500',
    formFieldLabel: 'text-xs font-semibold text-slate-600',
    formFieldInput:
      'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
    formFieldInputShowPasswordButton: 'text-slate-400 hover:text-slate-600',
    formPrimaryButton:
      'rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20',
    formSecondaryButton:
      'rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50',
    socialButtonsBlockButton:
      'rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50',
    footerActionLink: 'text-emerald-700 hover:text-emerald-800 hover:underline',
    dividerLine: 'bg-slate-200',
    dividerText: 'text-xs text-slate-400',
    identityPreviewText: 'text-slate-700',
    alertIcon: 'h-4 w-4',
    formErrorText: 'text-xs font-medium text-rose-600',
  },
} as const;

/** Props every Clerk auth component needs to route correctly under React Router. */
export const clerkRouting = {
  /** Clerk renders at real URLs instead of hash fragments, so `/sign-up/verify` works. */
  routing: 'path',
} as const;