'use client';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { FEATURES } from './Landing';

export default function FeaturesPage() {
  return (
    <>
      <section className="eos-aura relative overflow-hidden border-b border-neutral-200">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Features</p>
          <h1 className="eos-text-gradient-ink mt-2 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            The whole energy workflow for a small business, not just a bill reader.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600">
            Everything below ships today. The engine decides and the AI explains — so a number you
            see here can be traced to a rule, a bill or a meter reading.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/start"
              className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-5 py-3 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Check a bill free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-neutral-50"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200">
        <div className="mx-auto grid max-w-content gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-neutral-200 bg-white p-5">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 text-ink-900">
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="mt-3 text-sm font-semibold text-ink-900">{title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <ShieldCheck className="h-4 w-4" /> What EnerOS does not claim
          </p>
          <ul className="mt-3 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
            <li>• It does not invent savings: every £ is labelled estimated or verified.</li>
            <li>• It does not sell your data: bills are stored in your workspace only.</li>
            <li>• It does not act without permission: automation is opt-in and bounded.</li>
            <li>• It does not replace your supplier: it audits and challenges them for you.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
