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

/** Compact currency for chart axes, e.g. "£81k". */
export const compactGbp = (value: number): string =>
  `£${new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;

/** Percentage of a total, guarding against divide-by-zero. */
export const share = (part: number, total: number): number =>
  total === 0 ? 0 : (part / total) * 100;