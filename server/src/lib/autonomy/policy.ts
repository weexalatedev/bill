/**
 * Autonomy safety policy.
 *
 * The business plan is explicit on this point:
 *
 *   "Refrigeration, freezers, alarms, and safety equipment must never be
 *    controlled by the AI."
 *
 * This module is the single enforcement point. Any action that would move to the
 * **Automated** state is checked here first; if it touches a protected asset the
 * request is refused with a 422, regardless of the customer's control mode. It is
 * a hard gate in the API, not a UI hint — the UI can be bypassed, this cannot.
 */

export interface SafetyVerdict {
  /** True when the asset may be controlled automatically. */
  allowed: boolean;
  /** Human-readable reason when blocked, suitable for a 422 and the audit log. */
  reason?: string;
  /** Which protected term matched, for transparency. */
  matched?: string;
}

/**
 * Assets/actions that must never be automated. Matched case-insensitively
 * against the asset, title and rationale. Deliberately broad: a false positive
 * (refusing to automate something safe) is far better than a false negative
 * (defrosting a freezer full of stock or silencing a fire alarm).
 */
const PROTECTED: { pattern: RegExp; label: string }[] = [
  { pattern: /refrigerat/i, label: 'refrigeration' },
  { pattern: /freezer|freeze[- ]?room/i, label: 'freezers' },
  { pattern: /fridge|cold[- ]?room|chiller/i, label: 'cold storage' },
  { pattern: /alarm|siren/i, label: 'alarms' },
  { pattern: /fire|smoke|sprinkler|extract(?:or)? fan/i, label: 'fire and life safety' },
  { pattern: /gas (?:detector|valve|safety)|co detector|carbon monoxide/i, label: 'gas safety' },
  { pattern: /emergency (?:lighting|light)/i, label: 'emergency lighting' },
  { pattern: /security|access control|cctv/i, label: 'security systems' },
];

/** Classify an action for automatic control. Pure and synchronous — easy to test. */
export function checkControlSafety(input: {
  asset?: string | null;
  title?: string | null;
  rationale?: string | null;
}): SafetyVerdict {
  const haystack = [input.asset, input.title, input.rationale]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack) {
    return { allowed: false, reason: 'An action with no asset cannot be automated.' };
  }

  for (const { pattern, label } of PROTECTED) {
    if (pattern.test(haystack)) {
      return {
        allowed: false,
        matched: label,
        reason: `${label} must never be controlled automatically. This action can be recommended and reviewed, but it cannot be automated.`,
      };
    }
  }

  return { allowed: true };
}

/** The protected categories, exposed for the UI and documentation. */
export const PROTECTED_ASSET_LABELS = PROTECTED.map((p) => p.label);
