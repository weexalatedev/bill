/**
 * Octopus Energy distribution regions ↔ Ofgem price-cap regions.
 *
 * Octopus labels its 14 GB distribution areas with the letters A–P (there is no
 * I or O). Those areas are the *same* geographic regions Ofgem publishes its
 * price cap against, so a site that has already resolved a cap region from its
 * postcode can fetch the live Agile price for the correct area with no extra
 * lookup. Keeping the two label systems joined here means neither the engine nor
 * the UI has to know about both.
 */

/** The 14 Octopus region letters, in Ofgem's published order. */
export const OCTOPUS_REGION_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
] as const;

export type OctopusRegionLetter = (typeof OCTOPUS_REGION_LETTERS)[number];

/** Octopus letter → human label (matches Ofgem's region names). */
export const OCTOPUS_REGION_NAMES: Record<OctopusRegionLetter, string> = {
  A: 'Eastern England',
  B: 'East Midlands',
  C: 'London',
  D: 'Merseyside & North Wales',
  E: 'West Midlands',
  F: 'North Eastern England',
  G: 'North Western England',
  H: 'Southern England',
  J: 'South Eastern England',
  K: 'Southern Wales',
  L: 'South Western England',
  M: 'Yorkshire',
  N: 'Southern Scotland',
  P: 'Northern Scotland',
};

/** Ofgem cap-region id → Octopus region letter. */
const CAP_REGION_TO_OCTOPUS: Record<string, OctopusRegionLetter> = {
  'eastern-england': 'A',
  'east-midlands': 'B',
  london: 'C',
  'merseyside-north-wales': 'D',
  'west-midlands': 'E',
  'north-eastern-england': 'F',
  'north-western-england': 'G',
  'southern-england': 'H',
  'south-eastern-england': 'J',
  'southern-wales': 'K',
  'south-western-england': 'L',
  yorkshire: 'M',
  'southern-scotland': 'N',
  'northern-scotland': 'P',
};

export function isOctopusRegionLetter(value: string): value is OctopusRegionLetter {
  return (OCTOPUS_REGION_LETTERS as readonly string[]).includes(value.toUpperCase());
}

/** Normalise a region input (letter or cap-region id) to an Octopus letter. */
export function toOctopusRegion(value: string | undefined): OctopusRegionLetter | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (isOctopusRegionLetter(raw)) return raw.toUpperCase() as OctopusRegionLetter;
  const key = raw.toLowerCase().replace(/[\s_]+/g, '-');
  return CAP_REGION_TO_OCTOPUS[key];
}

export function regionNameFor(letter: string): string {
  return isOctopusRegionLetter(letter)
    ? OCTOPUS_REGION_NAMES[letter.toUpperCase() as OctopusRegionLetter]
    : letter;
}
