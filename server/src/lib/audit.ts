import type { BillIssue, Site } from '../types.js';
import { analyseBill } from './analysis.js';

export interface UploadPayload {
  siteId: string;
  supplier: string;
  period: string;
  consumptionKwh: number;
  unitRateP: number;
  standingChargeP: number;
  /** Optional — the engine uses these when they are supplied. */
  periodStart?: string;
  periodEnd?: string;
  totalGbp?: number;
  vatGbp?: number;
  paymentMethod?: 'direct-debit' | 'standard-credit' | 'prepayment';
  businessContract?: boolean;
}

/**
 * Project the Smart Analysis engine onto the legacy `BillIssue[]` shape the
 * invoice records and the existing Bill Auditor UI still consume.
 *
 * Keeping this adapter means the old invoice list keeps working untouched while
 * the richer findings live on `/api/analysis`. `impact` is negative when the
 * customer was overcharged, matching the original convention.
 */
export function auditInvoice(payload: UploadPayload, site: Site | undefined): BillIssue[] {
  const analysis = analyseBill(payload, site);
  return analysis.findings
    .filter((finding) => finding.impactGbp > 0)
    .map((finding) => ({
      type: ISSUE_TYPE[finding.code] ?? 'Unexpected change',
      detail: finding.detail,
      impact: -finding.impactGbp,
    }));
}

/**
 * Map engine finding codes onto the six issue types the product exposes.
 * Anything unrecognised is reported as an unexpected change rather than hidden.
 */
const ISSUE_TYPE: Record<string, BillIssue['type']> = {
  'unit-rate-above-cap': 'Tariff discrepancy',
  'standing-charge-above-cap': 'Standing charge',
  'total-overstated': 'Incorrect charge',
  'vat-removal-not-applied': 'Incorrect charge',
  'consumption-above-baseline': 'Abnormal consumption',
  'standing-charge-dominates': 'Tariff discrepancy',
  'half-hourly-required': 'Meter issue',
  'site-too-small-for-contract': 'Unexpected change',
  'time-of-use-opportunity': 'Unexpected change',
  'total-understated': 'Incorrect charge',
};

/** Compute the invoice total (ex. VAT) for a 31-day billing period. */
export function invoiceTotal(payload: UploadPayload): number {
  const total =
    (payload.consumptionKwh * payload.unitRateP) / 100 + (payload.standingChargeP * 31) / 100;
  return Math.round(total * 100) / 100;
}
