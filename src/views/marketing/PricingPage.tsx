'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import PlansGrid from '../../components/marketing/PlansGrid';
import type { PlansResponse } from '../../types';

export default function PricingPage() {
  const [catalogue, setCatalogue] = useState<PlansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPlans()
      .then(setCatalogue)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the plans just now.'),
      );
  }, []);

  return (
    <>
      <section className="border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pricing</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">
            One price per site. No seats, no setup fee.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600">
            Pick the plan that matches how much of the workflow you want EnerOS to own. Start with
            the free bill check — you only choose a plan once you have an account.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {error && (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            Live pricing could not be loaded ({error}). Plans start at £49 per site per month.
          </div>
        )}
        {!error && !catalogue && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-16 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
          </div>
        )}
        {catalogue && (
          <PlansGrid
            plans={catalogue.plans}
            annualAvailable={catalogue.annualBillingAvailable}
            recommendedId={catalogue.recommendedPlanId}
            ctaHref="/start"
            footnote={`${catalogue.priceBasis}. VAT at ${catalogue.vatRatePct}% is added at checkout.`}
          />
        )}
      </section>

      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">What happens next</h2>
          <ol className="mt-4 grid gap-3 text-sm text-neutral-600 md:grid-cols-4">
            {[
              'Check a bill free — no account, nothing stored.',
              'Create an account to save the audit.',
              'Choose a plan and pay per site, per month.',
              'Your dashboard opens once the payment is verified.',
            ].map((line, index) => (
              <li key={line} className="rounded-lg border border-neutral-200 bg-white p-4">
                <span className="text-xs font-semibold text-neutral-400">Step {index + 1}</span>
                <p className="mt-1 text-sm font-medium text-ink-900">{line}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/start"
              className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-5 py-3 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-white"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
