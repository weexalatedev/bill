'use client';
import Link from 'next/link';
import { ArrowRight, FileSearch, Info, ShieldCheck } from 'lucide-react';

const CHECKS = [
  {
    title: 'The bill’s own arithmetic',
    body: 'Consumption × unit rate, standing charge × days, plus VAT at the rate that applies. If the lines do not add to the total, the difference is quantified.',
  },
  {
    title: 'Charged rate vs your contracted rate',
    body: 'When we hold the contract rate for the site, the charged rate is compared with it. This is the check that finds rate creep after a renewal.',
  },
  {
    title: 'Standing-charge days',
    body: 'The number of days billed is compared with the length of the period. Paying for 31 days in a 30-day month compounds quietly.',
  },
  {
    title: 'Meter-read continuity',
    body: 'Estimated readings, back-to-back estimates and read reversals are flagged, because they move cost between periods without changing total use.',
  },
  {
    title: 'Your own history',
    body: 'Each site is compared with its previous bills, adjusted for season and trading days. This is what makes “abnormal” measurable rather than a feeling.',
  },
  {
    title: 'A published domestic reference',
    body: 'Ofgem publishes a price cap for domestic customers. We show it as a labelled benchmark, never as a rule a business contract must meet.',
  },
];

export default function MethodologyPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-neutral-200">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold tracking-wide text-neutral-600">Methodology</p>
          <h1 className="text-text-1 mt-2 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            How we check a bill, and what we refuse to claim.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-700">
            Every figure EnerOS shows is labelled <strong>verified</strong>, <strong>estimated</strong>{' '}
            or an <strong>issue</strong>, and the arithmetic behind it is one click away.
          </p>
        </div>
      </section>

      <section className="border-b border-neutral-200">
        <div className="mx-auto grid max-w-content gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
          {CHECKS.map(({ title, body }) => (
            <div key={title} className="rounded-xl border border-neutral-200 bg-white p-5">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 text-ink-900">
                <FileSearch className="h-4 w-4" />
              </span>
              <h2 className="mt-3 text-sm font-semibold text-ink-900">{title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-700">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <ShieldCheck className="h-4 w-4" /> The three labels
            </p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 eos-evidence" data-state="verified" aria-hidden />
                <span>
                  <strong>Verified</strong> — every input comes from your own documents and the
                  calculation is shown. A savings figure is signed off as verified only when it is
                  measured against your own baseline.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 eos-evidence" data-state="estimated" aria-hidden />
                <span>
                  <strong>Estimated</strong> — a model, a schedule change or a published reference
                  rate is doing part of the work. Useful, clearly not money in the bank.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 eos-evidence" data-state="issue" aria-hidden />
                <span>
                  <strong>Issue</strong> — a finding: money we believe is wrong until you recover
                  it or the supplier explains it.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Info className="h-4 w-4" /> What we do not claim
            </p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li>
                EnerOS is not an energy supplier or a broker. We do not sell you a tariff, and we do
                not take commission from one.
              </li>
              <li>
                We do not assert that a business contract must match the domestic cap. A negotiated
                business rate can legitimately sit above or below it.
              </li>
              <li>
                We do not guarantee a recovery. A finding is evidence to put to your supplier, not a
                legal determination.
              </li>
            </ul>
            <Link
              href="/start"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-[#9c4419]"
            >
              Check a bill against this <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
