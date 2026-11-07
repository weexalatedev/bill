'use client';
import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import type { MeterType, Site, SiteStatus, SiteType } from '../types';
import {
  Badge,
  Card,
  Field,
  Modal,
  SectionHeading,
  StatCard,
  controlClass,
  type Tone,
} from '../components/ui';
import { gbp, num, signedGbp } from '../lib/format';
import { useSubscription } from '../lib/subscription';

const statusTone: Record<SiteStatus, Tone> = {
  Optimal: 'muted',
  Watch: 'outline',
  Anomaly: 'solid',
};

const SITE_TYPES: SiteType[] = [
  'Restaurant',
  'Café',
  'Bakery',
  'Pub',
  'Hotel',
  'Food Production',
  'Retail',
];

const METER_TYPES: MeterType[] = ['Smart', 'Advanced', 'AMR', 'Half-hourly'];

const STATUSES: SiteStatus[] = ['Optimal', 'Watch', 'Anomaly'];

/** Blank form state; spend figures start empty until bills are audited. */
const emptyDraft = {
  name: '',
  city: '',
  region: '',
  type: 'Restaurant' as SiteType,
  annualSpend: '',
  monthActual: '',
  monthExpected: '',
  meterType: 'Advanced' as MeterType,
  status: 'Optimal' as SiteStatus,
  postcode: '',
  loads: '',
};

type Draft = typeof emptyDraft;
type DraftSetter = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

export default function Sites() {
  const { sites, annualSpendTotal, metrics, addSite, removeSite } = useApp();
  const { subscription, refresh: refreshSubscription } = useSubscription();
  /** Capacity comes from the server's subscription record, never a local guess. */
  const atCap = Boolean(subscription && subscription.remainingSites <= 0);
  // Seed the filter from `?q=` so the header search can deep-link into a result.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQueryState] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<'All' | SiteStatus>('All');
  const [type, setType] = useState<string>('All');

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);

  const types = useMemo(() => ['All', ...new Set(sites.map((s) => s.type))], [sites]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((site) => {
      const matchesStatus = status === 'All' || site.status === status;
      const matchesType = type === 'All' || site.type === type;
      const matchesQuery =
        q.length === 0 || `${site.name} ${site.city} ${site.region}`.toLowerCase().includes(q);
      return matchesStatus && matchesType && matchesQuery;
    });
  }, [sites, query, status, type]);

  const controllableLoads = sites.reduce((total, site) => total + site.loads.length, 0);
  const attention = sites.filter((s) => s.status !== 'Optimal').length;

  const set: DraftSetter = (key, value) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /** Keep the URL in step with the search box so the view stays shareable. */
  const setQuery = (next: string) => {
    setQueryState(next);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next) params.set('q', next); else params.delete('q');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeForm = () => {
    setFormOpen(false);
    setDraft(emptyDraft);
    setNameError(null);
    setSaveError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setNameError('Give the site a name.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      // Blank numeric inputs stay `undefined` so the server applies its own
      // defaults rather than persisting NaN from an empty string.
      const numberOrUndefined = (raw: string): number | undefined =>
        raw.trim() === '' ? undefined : Number(raw);

      await addSite({
        name,
        city: draft.city.trim(),
        region: draft.region.trim(),
        type: draft.type,
        meterType: draft.meterType,
        status: draft.status,
        postcode: draft.postcode.trim() || undefined,
        loads: draft.loads
          .split(',')
          .map((load) => load.trim())
          .filter(Boolean),
        annualSpend: numberOrUndefined(draft.annualSpend) ?? 0,
        monthActual: numberOrUndefined(draft.monthActual) ?? 0,
        monthExpected: numberOrUndefined(draft.monthExpected),
      });
      // The capacity counter is server-owned: re-read it so the banner, the
      // disabled state and the dashboard all agree immediately.
      await refreshSubscription();
      closeForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not add the site.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const site = pendingDelete;
    if (!site) return;
    setPendingDelete(null);
    try {
      await removeSite(site.id);
    } catch (error) {
      // The server-side list is unchanged, so there is nothing to reconcile —
      // surface the failure rather than dropping it silently.
      setSaveError(error instanceof Error ? error.message : 'Could not remove the site.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sites connected" value={num(sites.length)} sub="in the Energy Data OS" />
        <StatCard
          label="Annual energy spend"
          value={gbp(annualSpendTotal)}
          sub="across the portfolio"
        />
        <StatCard
          label="Controllable loads"
          value={num(controllableLoads)}
          sub="ready for optimisation"
        />
        <StatCard label="Needs attention" value={num(attention)} sub="watch or anomaly status" />
      </div>

      {subscription && (
        <Card className={atCap ? 'border-neutral-300 bg-neutral-50' : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                Sites used: {subscription.sitesUsed} / {subscription.siteLimit}{' '}
                <span className="text-xs font-normal text-neutral-500">
                  {atCap ? 'no capacity left' : `${subscription.remainingSites} remaining`} · {subscription.planName} plan
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {atCap
                  ? 'You have reached the maximum number of sites allowed in your current subscription. Upgrade your plan to add more sites.'
                  : 'Adding a site increases your monthly total — EnerOS is priced per site, per month.'}
              </p>
            </div>
            {atCap && (
              <Link
                href="/onboarding/subscription"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ink-900 px-3 py-2 text-xs font-semibold text-white hover:bg-ink-800"
              >
                Upgrade plan
              </Link>
            )}
          </div>
        </Card>
      )}

      <Card>
        <SectionHeading
          title="Portfolio"
          subtitle="Every site gets a continuously updated digital energy model."
          action={
            <div className="flex items-center gap-2">
              <Badge tone="solid">Saved this month {signedGbp(metrics.savings)}</Badge>
              <button
                type="button"
                onClick={() => !atCap && setFormOpen(true)}
                disabled={atCap}
                title={
                  atCap
                    ? 'You have reached the maximum number of sites allowed in your current subscription.'
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add site
              </button>
            </div>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5">
            <Search className="h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites…"
              aria-label="Search sites"
              className="w-44 bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'All' | SiteStatus)}
            aria-label="Filter by status"
            className={controlClass + ' w-auto py-1.5'}
          >
            {(['All', ...STATUSES] as const).map((option) => (
              <option key={option} value={option}>
                {option === 'All' ? 'All statuses' : option}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
            className={controlClass + ' w-auto py-1.5'}
          >
            {types.map((option) => (
              <option key={option} value={option}>
                {option === 'All' ? 'All types' : option}
              </option>
            ))}
          </select>
          {(query || status !== 'All' || type !== 'All') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatus('All');
                setType('All');
              }}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-neutral-400">
            Showing {num(visible.length)} of {num(sites.length)}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((site) => {
            const saving = site.monthExpected - site.monthActual;
            return (
              <div
                key={site.id}
                className="group flex flex-col rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-neutral-900">{site.name}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {[site.city, site.region].filter(Boolean).join(', ') || 'Location not set'}
                    </p>
                  </div>
                  <Badge tone={statusTone[site.status]}>{site.status}</Badge>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-neutral-100 py-3">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-neutral-400">
                      This month
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-neutral-900">
                      {gbp(site.monthActual)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Saved</dt>
                    <dd
                      className={
                        saving >= 0
                          ? 'mt-0.5 text-sm font-semibold text-neutral-600 tabular-nums'
                          : 'mt-0.5 text-sm font-semibold text-ink-900 tabular-nums'
                      }
                    >
                      {signedGbp(saving)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Annual</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-neutral-900">
                      {gbp(site.annualSpend)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex min-h-[1.75rem] flex-wrap content-start gap-1.5">
                  {site.loads.length === 0 ? (
                    <span className="text-xs text-neutral-400">No controllable loads recorded</span>
                  ) : (
                    site.loads.map((load) => (
                      <span
                        key={load}
                        className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600"
                      >
                        {load}
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <div className="min-w-0 text-xs text-neutral-400">
                    <p className="truncate">
                      {site.type} · {site.meterType} meter
                    </p>
                    <p className="truncate">Synced {site.lastSynced}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(site)}
                    aria-label={`Remove ${site.name}`}
                    className="shrink-0 rounded-md p-1.5 text-neutral-300 opacity-0 transition hover:bg-neutral-50 hover:text-neutral-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-neutral-500">
            No sites match your filters.
          </p>
        )}
      </Card>

      <AddSiteModal
        open={formOpen}
        onClose={closeForm}
        draft={draft}
        set={set}
        saving={saving}
        saveError={saveError}
        nameError={nameError}
        onNameChange={(value) => {
          set('name', value);
          if (nameError) setNameError(null);
        }}
        onSubmit={submit}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Remove this site?"
        description={
          pendingDelete
            ? `${pendingDelete.name} and its invoices and actions will be deleted.`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              className="rounded-md bg-neutral-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
            >
              Remove site
            </button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          This cannot be undone. The site is removed from the portfolio along with its invoices and
          optimisation actions.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Add-site form.
 *
 * Split out of the page so the field markup does not bury the list itself. The
 * submit button lives in the modal footer and targets the form by id, which
 * keeps Enter-to-submit working without nesting the footer inside the <form>.
 */
function AddSiteModal({
  open,
  onClose,
  draft,
  set,
  saving,
  saveError,
  nameError,
  onNameChange,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  draft: Draft;
  set: DraftSetter;
  saving: boolean;
  saveError: string | null;
  nameError: string | null;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a site"
      description="Register a new location. Spend figures can be filled in later from its bills."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-site-form"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Adding…' : 'Add site'}
          </button>
        </>
      }
    >
      <form id="add-site-form" onSubmit={onSubmit} className="space-y-4">
        {saveError && (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">
            {saveError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Site name" error={nameError ?? undefined}>
              <input
                value={draft.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Harbour House"
                aria-invalid={Boolean(nameError)}
                className={controlClass}
              />
            </Field>
          </div>

          <Field label="City">
            <input
              value={draft.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Manchester"
              className={controlClass}
            />
          </Field>

          <Field label="Region">
            <input
              value={draft.region}
              onChange={(e) => set('region', e.target.value)}
              placeholder="North West"
              className={controlClass}
            />
          </Field>

          <Field label="Postcode" hint="Sets the Ofgem price-cap region.">
            <input
              value={draft.postcode}
              onChange={(e) => set('postcode', e.target.value)}
              placeholder="M1 1AE"
              className={controlClass}
            />
          </Field>

          <Field label="Site type">
            <select
              value={draft.type}
              onChange={(e) => set('type', e.target.value as SiteType)}
              className={controlClass}
            >
              {SITE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Meter type">
            <select
              value={draft.meterType}
              onChange={(e) => set('meterType', e.target.value as MeterType)}
              className={controlClass}
            >
              {METER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) => set('status', e.target.value as SiteStatus)}
              className={controlClass}
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Annual spend (£)" hint="Optional — an estimate is fine.">
            <input
              type="number"
              min={0}
              step={100}
              value={draft.annualSpend}
              onChange={(e) => set('annualSpend', e.target.value)}
              placeholder="195000"
              className={controlClass}
            />
          </Field>

          <Field label="This month (£)">
            <input
              type="number"
              min={0}
              step={10}
              value={draft.monthActual}
              onChange={(e) => set('monthActual', e.target.value)}
              placeholder="8120"
              className={controlClass}
            />
          </Field>

          <Field
            label="Expected this month (£)"
            hint="Leave blank to match actual spend, so no saving is claimed."
          >
            <input
              type="number"
              min={0}
              step={10}
              value={draft.monthExpected}
              onChange={(e) => set('monthExpected', e.target.value)}
              placeholder="9150"
              className={controlClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Controllable loads" hint="Comma separated, e.g. HVAC, Hot water.">
              <input
                value={draft.loads}
                onChange={(e) => set('loads', e.target.value)}
                placeholder="HVAC, Hot water, Lighting"
                className={controlClass}
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}
