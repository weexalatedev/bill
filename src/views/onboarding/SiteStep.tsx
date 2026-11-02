'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Loader2 } from 'lucide-react';
import { Card, Field, controlClass } from '../../components/ui';
import { gbp } from '../../lib/format';
import { EMPTY_SITE_FORM, SiteFields, type SiteFormValues } from './SiteFields';

/**
 * Phase 1 — the first site. Captures the business name and one site; the postcode
 * resolves the Ofgem cap region every later benchmark is drawn against.
 */
export default function SiteStep({
  defaultCompanyName,
  saving,
  onSubmit,
  onSkip,
}: {
  defaultCompanyName: string;
  /** The saving found by the public bill check, if the visitor ran one. */
  saving: number | null;
  onSubmit: (businessName: string, values: SiteFormValues) => Promise<void>;
  onSkip: () => void;
}) {
  const [businessName, setBusinessName] = useState(defaultCompanyName);
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
      await onSubmit(businessName.trim() || 'My business', values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your site.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {saving !== null && saving > 0.5 && (
        <Card className="flex items-start gap-3 border-neutral-300 bg-neutral-50/70">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Your audit found {gbp(saving)} on that bill
            </p>
            <p className="mt-0.5 text-xs text-neutral-800/90">
              Add the site below and we will keep checking it — every bill, every month.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          <Field label="Business name" hint="Shown across your console.">
            <input
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Kirkstall Kitchens Ltd"
              className={controlClass + ' sm:max-w-md'}
            />
          </Field>

          <div className="border-t border-neutral-100 pt-5">
            <SiteFields values={values} set={set} />
          </div>

          {touched && !values.name.trim() && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800">
              Give the site a name so we can file its bills and benchmarks against it.
            </p>
          )}
          {error && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-5">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? 'Saving your site…' : 'Save and continue'}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-600"
            >
              Skip for now
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
