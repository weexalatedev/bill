import type { BillIssue, Site } from '../types.js';

export interface UploadPayload {
  siteId: string;
  supplier: string;
  period: string;
  consumptionKwh: number;
  unitRateP: number;
  standingChargeP: number;
}

/**
 * Heuristic "AI audit" of a freshly uploaded invoice — ported verbatim from the
 * original front-end store so behaviour is unchanged, now run server-side so
 * web and mobile produce identical results.
 */
export function auditInvoice(payload: UploadPayload, site: Site | undefined): BillIssue[] {
  const issues: BillIssue[] = [];
  const benchmarkKwh = site ? Math.round(site.monthActual / 0.26) : 20000;

  if (payload.consumptionKwh > benchmarkKwh * 1.1) {
    const overKwh = payload.consumptionKwh - benchmarkKwh;
    issues.push({
      type: 'Abnormal consumption',
      detail: `Consumption is ${Math.round((overKwh / benchmarkKwh) * 100)}% above comparable sites.`,
      impact: -Math.round((overKwh * payload.unitRateP) / 100),
    });
  }

  if (payload.unitRateP > 26) {
    issues.push({
      type: 'Tariff discrepancy',
      detail: `Unit rate of ${payload.unitRateP.toFixed(1)}p/kWh is above your contracted rate.`,
      impact: -Math.round(((payload.unitRateP - 26) * payload.consumptionKwh) / 100),
    });
  }

  if (payload.standingChargeP > 100) {
    issues.push({
      type: 'Standing charge',
      detail: 'Standing charge looks high for a meter with this profile — worth querying.',
      impact: -Math.round((payload.standingChargeP - 100) * 0.31),
    });
  }

  return issues;
}

/** Compute the invoice total (ex. VAT) for a 31-day billing period. */
export function invoiceTotal(payload: UploadPayload): number {
  const total =
    (payload.consumptionKwh * payload.unitRateP) / 100 + (payload.standingChargeP * 31) / 100;
  return Math.round(total * 100) / 100;
}
