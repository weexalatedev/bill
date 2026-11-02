'use client';
import { Field, controlClass } from '../../components/ui';
import type { SiteDraft } from '../../lib/api';
import type { MeterType, SiteType } from '../../types';

export const SITE_TYPES: SiteType[] = [
  'Restaurant',
  'Café',
  'Bakery',
  'Pub',
  'Hotel',
  'Food Production',
  'Retail',
];

export const METER_TYPES: MeterType[] = ['Smart', 'Advanced', 'AMR', 'Half-hourly'];

export interface SiteFormValues {
  name: string;
  postcode: string;
  city: string;
  region: string;
  type: SiteType;
  meterType: MeterType;
  annualSpend: string;
  loads: string;
}

export const EMPTY_SITE_FORM: SiteFormValues = {
  name: '',
  postcode: '',
  city: '',
  region: '',
  type: 'Restaurant',
  meterType: 'Smart',
  annualSpend: '',
  loads: '',
};

/** Map the onboarding form to the API's `SiteDraft` shape. */
export function siteFormToDraft(values: SiteFormValues): SiteDraft {
  const spend = Number(values.annualSpend);
  return {
    name: values.name.trim(),
    city: values.city.trim(),
    region: values.region.trim(),
    type: values.type,
    meterType: values.meterType,
    postcode: values.postcode.trim().toUpperCase() || undefined,
    loads: values.loads
      .split(',')
      .map((load) => load.trim())
      .filter(Boolean),
    annualSpend: Number.isFinite(spend) ? spend : 0,
    monthActual: 0,
  };
}

type Setter = <K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) => void;

/** The site fields, shared by the first-site step and the "add another site" step. */
export function SiteFields({ values, set }: { values: SiteFormValues; set: Setter }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Site name" hint="What you call this location, e.g. “Leeds — Kirkstall”.">
        <input
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Leeds — Kirkstall"
          className={controlClass}
          required
        />
      </Field>
      <Field label="Postcode" hint="Sets the Ofgem price-cap region for benchmarking.">
        <input
          value={values.postcode}
          onChange={(event) => set('postcode', event.target.value.toUpperCase())}
          placeholder="M1 4BT"
          className={controlClass}
        />
      </Field>
      <Field label="Town / city">
        <input
          value={values.city}
          onChange={(event) => set('city', event.target.value)}
          placeholder="Leeds"
          className={controlClass}
        />
      </Field>
      <Field label="Region" hint="Optional — used for portfolio grouping.">
        <input
          value={values.region}
          onChange={(event) => set('region', event.target.value)}
          placeholder="Yorkshire"
          className={controlClass}
        />
      </Field>
      <Field label="Site type">
        <select
          value={values.type}
          onChange={(event) => set('type', event.target.value as SiteType)}
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
          value={values.meterType}
          onChange={(event) => set('meterType', event.target.value as MeterType)}
          className={controlClass}
        >
          {METER_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Annual energy spend (£)" hint="A rough estimate is fine.">
        <input
          type="number"
          min={0}
          step={100}
          value={values.annualSpend}
          onChange={(event) => set('annualSpend', event.target.value)}
          placeholder="195000"
          className={controlClass}
        />
      </Field>
      <Field label="Controllable loads" hint="Comma separated, e.g. HVAC, Hot water.">
        <input
          value={values.loads}
          onChange={(event) => set('loads', event.target.value)}
          placeholder="HVAC, Hot water, Lighting"
          className={controlClass}
        />
      </Field>
    </div>
  );
}
