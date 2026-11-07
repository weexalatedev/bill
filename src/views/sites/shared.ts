import type { MeterType, Site, SiteStatus, SiteType } from '../../types';

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

export const STATUSES: SiteStatus[] = ['Optimal', 'Watch', 'Anomaly'];

/** Blank form state; spend figures start empty until bills are audited. */
export const emptyDraft = {
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

export type Draft = typeof emptyDraft;
export type DraftSetter = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

/** Prefill the form from an existing site. Blank spend stays blank, not zero. */
export function siteToDraft(site: Site): Draft {
  return {
    name: site.name,
    city: site.city ?? '',
    region: site.region ?? '',
    type: site.type,
    annualSpend: site.annualSpend ? String(site.annualSpend) : '',
    monthActual: site.monthActual ? String(site.monthActual) : '',
    monthExpected: site.monthExpected ? String(site.monthExpected) : '',
    meterType: site.meterType,
    status: site.status,
    postcode: site.postcode ?? '',
    loads: site.loads.join(', '),
  };
}
