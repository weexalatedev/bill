'use client';
/**
 * Clerk appearance — one place so the hosted Clerk components match the EnerOS
 * chrome on every screen (auth pages, and the user button in the header).
 *
 * Monochrome, like the rest of the app: ink for action, paper for surfaces, a
 * neutral grey ramp for everything secondary. `colorDanger` is deliberately
 * ink rather than red — errors are marked by the message and the icon, not hue.
 */

export const clerkAppearance = {
  variables: {
    colorPrimary: '#0a0a0a',
    colorBackground: '#ffffff',
    colorText: '#0a0a0a',
    colorTextSecondary: '#737373',
    colorInputBackground: '#ffffff',
    colorInputText: '#0a0a0a',
    colorInputPlaceholder: '#a3a3a3',
    colorDanger: '#0a0a0a',
    borderRadius: '0.375rem',
    fontFamily:
      "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  elements: {
    rootBox: 'mx-auto w-full',
    cardBox: 'w-full max-w-md',
    card: 'rounded-xl border border-neutral-200 bg-white p-7 sm:p-8',
    headerTitle: 'text-xl font-semibold tracking-tight text-ink-900',
    headerSubtitle: 'text-sm text-neutral-500',
    formFieldLabel:
      'text-[11px] font-semibold uppercase tracking-wider text-neutral-500',
    formFieldInput:
      'rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-ink-900 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10',
    formFieldInputShowPasswordButton: 'text-neutral-400 hover:text-ink-900',
    formPrimaryButton:
      'rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-ink-900/20',
    formSecondaryButton:
      'rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-neutral-50',
    socialButtonsBlockButton:
      'rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-neutral-50',
    footerActionLink: 'font-semibold text-ink-900 hover:underline',
    dividerLine: 'bg-neutral-200',
    dividerText: 'text-xs text-neutral-400',
    identityPreviewText: 'text-neutral-700',
    alertIcon: 'h-4 w-4',
    formErrorText: 'text-xs font-medium text-ink-900',
  },
} as const;

/** Props every Clerk auth component needs to route correctly under React Router. */
export const clerkRouting = {
  /** Clerk renders at real URLs instead of hash fragments, so `/sign-up/verify` works. */
  routing: 'path',
} as const;
