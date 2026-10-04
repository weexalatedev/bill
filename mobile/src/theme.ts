/**
 * Design tokens for EnerOS mobile.
 * Mirrors the web app's Tailwind palette so both apps stay visually consistent.
 */

export const colors = {
  // Surfaces / neutrals (slate)
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',

  // Ink (brand chrome)
  ink950: '#060d1a',
  ink900: '#0b1220',
  ink850: '#0e1728',
  ink800: '#131c2e',
  ink750: '#18233a',
  ink700: '#1d2942',
  ink650: '#26334f',

  // Success / primary (emerald)
  emerald50: '#ecfdf5',
  emerald100: '#d1fae5',
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',

  teal600: '#0d9488',

  // Danger (rose)
  rose50: '#fff1f2',
  rose100: '#ffe4e6',
  rose500: '#f43f5e',
  rose600: '#e11d48',
  rose700: '#be123c',

  // Warning (amber)
  amber50: '#fffbeb',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',

  // Info (sky)
  sky50: '#f0f9ff',
  sky500: '#0ea5e9',
  sky600: '#0284c7',
  sky700: '#0369a1',

  // Accent (violet)
  violet50: '#f5f3ff',
  violet500: '#8b5cf6',
  violet600: '#7c3aed',
  violet700: '#6d28d9',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 } as const;

export const radius = { sm: 8, md: 10, lg: 12, xl: 16, pill: 999 } as const;

/** Text scale, kept small and consistent for a phone viewport. */
export const font = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const fontWeight = {
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Brand status colours, shared by charts, badges and status dots. */
export const status = {
  emerald: { fg: colors.emerald700, bg: colors.emerald50, soft: colors.emerald100, dot: colors.emerald500 },
  amber: { fg: colors.amber700, bg: colors.amber50, soft: '#fef3c7', dot: colors.amber500 },
  rose: { fg: colors.rose700, bg: colors.rose50, soft: colors.rose100, dot: colors.rose500 },
  sky: { fg: colors.sky700, bg: colors.sky50, soft: '#e0f2fe', dot: colors.sky500 },
  violet: { fg: colors.violet700, bg: colors.violet50, soft: '#ede9fe', dot: colors.violet500 },
  slate: { fg: colors.slate600, bg: colors.slate100, soft: colors.slate200, dot: colors.slate500 },
} as const;

export type StatusTone = keyof typeof status;

export const shadow = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  float: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
