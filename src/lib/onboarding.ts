'use client';
/**
 * Small, browser-only state shared across the acquisition → onboarding journey.
 *
 * The public bill check runs *before* there is any account, so the only place its
 * result can live until the visitor signs up is the session. We keep it to the
 * handful of numbers the onboarding screens quote — never the raw bill.
 */

export interface AuditSummary {
  /** Recoverable amount from the audit findings (GBP). */
  recoverableGbp: number;
  /** What the supplier actually charged (GBP). */
  actualTotalGbp: number | null;
  /** What the UK reference rate says it should have cost (GBP). */
  benchmarkTotalGbp: number | null;
  /** How far over the benchmark the bill is (GBP). */
  savingGbp: number | null;
  /** What the benchmark was drawn from, e.g. "North Western England Ofgem cap". */
  benchmarkLabel: string;
  /** The bill's audit score, 0–100. */
  score: number;
  supplier?: string;
}

const AUDIT_KEY = 'eneros.audit.summary';
const SKIPPED_KEY = 'eneros.onboarding.skipped';

function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function writeAuditSummary(summary: AuditSummary): void {
  const store = sessionStore();
  if (!store) return;
  try {
    store.setItem(AUDIT_KEY, JSON.stringify(summary));
  } catch {
    // Private mode / quota — the journey simply carries on without the recap.
  }
}

export function readAuditSummary(): AuditSummary | null {
  const store = sessionStore();
  if (!store) return null;
  try {
    const raw = store.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as AuditSummary) : null;
  } catch {
    return null;
  }
}

export function clearAuditSummary(): void {
  const store = sessionStore();
  if (!store) return;
  try {
    store.removeItem(AUDIT_KEY);
  } catch {
    // ignore
  }
}

/** Remember a deliberate "skip onboarding" so we do not nag on every sign-in. */
export function markOnboardingSkipped(): void {
  const store = localStore();
  if (!store) return;
  try {
    store.setItem(SKIPPED_KEY, '1');
  } catch {
    // ignore
  }
}

export function wasOnboardingSkipped(): boolean {
  const store = localStore();
  if (!store) return false;
  try {
    return store.getItem(SKIPPED_KEY) === '1';
  } catch {
    return false;
  }
}
