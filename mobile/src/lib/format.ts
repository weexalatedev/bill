// Formatting helpers — UK / en-GB conventions throughout (£, kWh, p/kWh).

const currency0 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const currency2 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const number0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** £1,234 (whole pounds). */
export const gbp = (value: number): string => currency0.format(value);

/** £1,234.56 (pence precision). */
export const gbp2 = (value: number): string => currency2.format(value);

/** 12,480 (grouped). */
export const num = (value: number): string => number0.format(value);

/** 12,480 kWh. */
export const kwh = (value: number): string => `${number0.format(value)} kWh`;

/** 11.4%. */
export const pct = (value: number, dp = 1): string => `${value.toFixed(dp)}%`;

/** +£1,234 or −£1,234 (for savings / anomalies). */
export const signedGbp = (value: number): string =>
  `${value >= 0 ? '+' : '−'}${currency0.format(Math.abs(value))}`;

/** p/kWh to string, e.g. "24.6p". */
export const pence = (value: number, dp = 1): string => `${value.toFixed(dp)}p`;

/**
 * Compact currency for chart axes, e.g. "£81k".
 *
 * Hand-rolled rather than using `Intl.NumberFormat`'s `notation: 'compact'`
 * option — the Hermes JS engine does not consistently implement that option
 * across RN versions, and a throw here would blank the whole chart.
 */
export const compactGbp = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `£${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}m`;
  }
  if (abs >= 1_000) {
    const scaled = value / 1_000;
    return `£${abs >= 10_000 ? scaled.toFixed(0) : scaled.toFixed(1)}k`;
  }
  return `£${number0.format(value)}`;
};

/** Percentage of a total, guarding against divide-by-zero. */
export const share = (part: number, total: number): number =>
  total === 0 ? 0 : (part / total) * 100;
