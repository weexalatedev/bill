'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Building2, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { Card } from '../../components/ui';
import type { Site } from '../../types';
import { EMPTY_SITE_FORM, SiteFields, type SiteFormValues } from './SiteFields';

/**
 * Phase 2 — "do you have more sites?". Everything in EnerOS is filed per site, so
 * this is where a multi-site business gets its portfolio in. Entirely optional.
 */
export default function MoreSitesStep({
  sites,
  onAdd,
  onContinue,
  onSkip,
}: {
  sites: Site[];
  onAdd: (values: SiteFormValues) => Promise<void>;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [values, setValues] = useState<SiteFormValues>(EMPTY_SITE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const set = <K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!values.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(values);
      setValues(EMPTY_SITE_FORM);
      setTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that site.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Building2 className="h-4 w-4 text-neutral-600" /> Your portfolio
          </p>
          <span className="text-xs text-neutral-600">
            {sites.length} site{sites.length === 1 ? '' : 's'}
          </span>
        </div>
        {sites.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            No sites yet — you can add them here, or any time from the Sites page.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {sites.map((site) => (
              <li key={site.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-neutral-600" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">{site.name}</p>
                    <p className="text-xs text-neutral-600">
                      {[site.city, site.postcode].filter(Boolean).join(' · ') || site.type}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-neutral-600">{site.type}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Plus className="h-4 w-4 text-neutral-600" /> Add another site
        </p>
        <p className="mt-0.5 text-xs text-neutral-600">
          Every bill you upload is filed and benchmarked against its own site.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <SiteFields values={values} set={set} />

          {touched && !values.name.trim() && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800">
              Give the site a name first.
            </p>
          )}
          {error && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {busy ? 'Adding…' : 'Add this site'}
          </button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          Continue to devices <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-600"
        >
          I only have one site
        </button>
      </div>
    </div>
  );
}
