/**
 * Dispute letter builder — the business plan lists "generate dispute letters" as
 * a core deliverable, and it is the natural next step after the auditor finds an
 * overcharge.
 *
 * Deliberately deterministic: a dispute letter is quasi-legal correspondence, so
 * it must be reproducible and quote only findings the engine actually produced.
 * The engine decides what to claim; this module writes the letter.
 */

import type { BillAnalysis, BillInput } from '../types.js';

export interface DisputeContext {
  supplier?: string;
  accountNumber?: string;
  mpan?: string;
  customerName?: string;
  siteName?: string;
  siteAddress?: string;
  periodLabel?: string;
  signatory?: string;
}

export interface DisputeLetter {
  subject: string;
  body: string;
  totalClaimedGbp: number;
  findingCount: number;
}

const gbp = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pence = (n: number): string => `${n.toFixed(2)}p`;

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Build a formal dispute letter from an audit result. Only findings with a
 * positive `impactGbp` (money owed to the customer) are claimed; others are
 * listed as "also for review" so the letter is accurate about what is proven
 * versus what is a question.
 */
export function buildDisputeLetter(
  analysis: BillAnalysis,
  bill: BillInput,
  context: DisputeContext = {},
): DisputeLetter {
  const today = new Date();
  const supplier = context.supplier ?? bill.supplier ?? 'your supplier';
  const period =
    context.periodLabel ??
    (bill.periodStart && bill.periodEnd
      ? `${bill.periodStart} to ${bill.periodEnd}`
      : 'the billing period shown on the invoice');

  const recoverable = analysis.findings.filter((f) => f.impactGbp > 0);
  const forReview = analysis.findings.filter((f) => f.impactGbp <= 0);
  const totalClaimed = recoverable.reduce((sum, f) => sum + f.impactGbp, 0);

  const customer = context.customerName ?? '[Your business name]';
  const signatory = context.signatory ?? customer;

  const lines: string[] = [];
  lines.push(customer);
  if (context.siteAddress) lines.push(context.siteAddress);
  else if (context.siteName) lines.push(context.siteName);
  lines.push('');
  lines.push(`Date: ${DATE_FMT.format(today)}`);
  lines.push('');
  lines.push('Customer Complaints / Billing Disputes');
  lines.push(supplier);
  lines.push('');
  lines.push(`Subject: Formal dispute of charges and request for correction — ${period}`);
  lines.push('');
  if (context.accountNumber) lines.push(`Account number: ${context.accountNumber}`);
  if (context.mpan) lines.push(`MPAN: ${context.mpan}`);
  if (bill.consumptionKwh !== undefined) {
    lines.push(`Billed consumption: ${bill.consumptionKwh.toLocaleString('en-GB')} kWh`);
  }
  if (bill.unitRateP !== undefined) lines.push(`Billed unit rate: ${pence(bill.unitRateP)}/kWh`);
  if (bill.standingChargeP !== undefined) {
    lines.push(`Billed standing charge: ${pence(bill.standingChargeP)}/day`);
  }
  if (bill.totalGbp !== undefined) lines.push(`Total invoiced: ${gbp(bill.totalGbp)}`);
  lines.push('');
  lines.push('Dear Sir or Madam,');
  lines.push('');
  lines.push(
    `I am writing to dispute the charges on my electricity invoice for ${period}. ` +
      `I have reviewed the invoice against its own itemised arithmetic and against the ` +
      `published reference rates for the ${analysis.region?.name ?? 'relevant'} region. ` +
      `That review identified ${analysis.findings.length} issue${
        analysis.findings.length === 1 ? '' : 's'
      }, set out below.`,
  );
  lines.push('');

  if (recoverable.length > 0) {
    lines.push('Charges I am disputing');
    recoverable.forEach((f, i) => {
      lines.push('');
      lines.push(`${i + 1}. ${f.title} — ${gbp(f.impactGbp)}`);
      lines.push(`   ${f.detail}`);
      if (f.evidence.length > 0) {
        lines.push('   Supporting figures:');
        for (const ev of f.evidence) {
          lines.push(`   - ${ev.label}: ${ev.value}`);
        }
      }
      lines.push(`   Requested remedy: ${f.recommendation}`);
    });
    lines.push('');
    lines.push(`Total amount I am disputing: ${gbp(totalClaimed)}`);
    lines.push('');
  } else {
    lines.push(
      'I have not identified a definite overcharge on the amounts themselves, but I am ' +
        'asking you to confirm the items below are correct.',
    );
    lines.push('');
  }

  if (forReview.length > 0) {
    lines.push('Matters I also ask you to confirm or correct');
    forReview.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.title} — ${f.detail}`);
    });
    lines.push('');
  }

  lines.push(
    'Please treat this as a formal complaint under your complaints procedure. I request a ' +
      'written response within 14 days, setting out either a corrected invoice and refund of ' +
      `the disputed amount (${gbp(totalClaimed)}), or the specific basis on which each charge ` +
      'is said to be correct.',
  );
  lines.push('');
  lines.push(
    'If I do not receive a satisfactory response, I intend to refer the matter to the Energy ' +
      'Ombudsman (for micro-business supplies) or to pursue it through the relevant dispute ' +
      'resolution route. I am keeping a full record of this correspondence.',
  );
  lines.push('');
  lines.push('Yours faithfully,');
  lines.push('');
  lines.push(signatory);
  lines.push('');
  lines.push('---');
  lines.push(
    'Prepared with EnerOS. The figures above are derived from the invoice you issued and ' +
      'published Ofgem reference rates; they are provided to support this complaint, not as ' +
      'legal advice.',
  );

  return {
    subject: `Formal dispute of charges — ${period}`,
    body: lines.join('\n'),
    totalClaimedGbp: Math.round(totalClaimed * 100) / 100,
    findingCount: analysis.findings.length,
  };
}
