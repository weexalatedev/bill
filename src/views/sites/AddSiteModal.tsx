"use client";
import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { MeterType, SiteStatus, SiteType } from '../../types';
import { Field, Modal, controlClass } from '../../components/ui';
import {
  METER_TYPES,
  SITE_TYPES,
  STATUSES,
  type Draft,
  type DraftSetter,
} from './shared';

/**
 * Add-site form.
 *
 * Split out of the page so the field markup does not bury the list itself. The
 * submit button lives in the modal footer and targets the form by id, which
 * keeps Enter-to-submit working without nesting the footer inside the <form>.
 */
export default function AddSiteModal({
  mode = 'create',
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
  /** `edit` keeps identity and capacity untouched and only patches fields. */
  mode?: 'create' | 'edit';
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
      title={mode === 'edit' ? 'Edit site' : 'Add a site'}
      description={
        mode === 'edit'
          ? 'Change the details of this location. Invoices already filed stay attached.'
          : 'Register a new location. Spend figures can be filled in later from its bills.'
      }
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
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add site'}
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
