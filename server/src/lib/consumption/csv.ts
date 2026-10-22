/**
 * Half-hourly consumption CSV ingestion.
 *
 * UK suppliers export half-hourly data in two shapes:
 *   • long  — `timestamp,kwh` (or `date,time,kwh`), one row per half hour
 *   • wide  — `date,p1,p2,…,p48`, one row per day
 *
 * This parser accepts both, plus a header or no header, and returns a normalised
 * `{ from, kwh }` series with a quality report. It never throws on bad rows — it
 * skips them and counts them, so the customer sees what was understood.
 */

export interface ConsumptionPoint {
  from: string;
  kwh: number;
}

export interface CsvQuality {
  format: 'long' | 'wide' | 'unknown';
  rows: number;
  accepted: number;
  rejected: number;
  first: string | null;
  last: string | null;
  periods: number;
  days: number;
  coveragePct: number;
  gaps: number;
  zeroOrNegative: number;
  notes: string[];
}

const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[£,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTimestamp(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) ? t.replace(' ', 'T') : t;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function looksNumeric(raw: string): boolean {
  return toNumber(raw) !== null;
}

function isHeader(row: string[], hasTimeColumn: boolean): boolean {
  return row.some((cell) => {
    if (looksNumeric(cell)) return false;
    if (parseTimestamp(cell) !== null) return false;
    if (hasTimeColumn && /^\d{1,2}:\d{2}/.test(cell)) return false;
    return cell.length > 0;
  });
}

export function parseConsumptionCsv(text: string): { points: ConsumptionPoint[]; quality: CsvQuality } {
  const notes: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = lines.map((l) => l.split(',').map((c) => c.trim()));
  const emptyQuality: CsvQuality = {
    format: 'unknown',
    rows: 0,
    accepted: 0,
    rejected: 0,
    first: null,
    last: null,
    periods: 0,
    days: 0,
    coveragePct: 0,
    gaps: 0,
    zeroOrNegative: 0,
    notes,
  };
  if (rows.length === 0) {
    notes.push('No rows found in the upload.');
    return { points: [], quality: emptyQuality };
  }

  const firstRow = rows[0];
  const hasTimeCol = firstRow.slice(0, 3).some((c) => /^\d{1,2}:\d{2}/.test(c));
  const headerPresent = isHeader(firstRow, hasTimeCol);
  const header = headerPresent ? firstRow.map((h) => h.toLowerCase()) : [];
  const dataRows = headerPresent ? rows.slice(1) : rows;

  const colIndex = (patterns: RegExp[], fallback: number): number => {
    const idx = header.findIndex((h) => patterns.some((p) => p.test(h)));
    return idx >= 0 ? idx : fallback;
  };

  const dataWidth = dataRows.length > 0 ? dataRows[0].length : firstRow.length;
  const wide = dataWidth > 24;
  const long =
    !wide &&
    (headerPresent
      ? header.some((h) => /kwh|value|consumption|usage/.test(h))
      : firstRow.length <= 3);

  if (!wide && !long) {
    notes.push('Could not recognise the columns — expected `timestamp,kwh` or `date,p1..p48`.');
    return { points: [], quality: { ...emptyQuality, rows: dataRows.length } };
  }

  const map = new Map<number, number>();
  let rejected = 0;
  let zeroOrNegative = 0;

  if (long) {
    const dateIdx = colIndex([/date|time|from|timestamp|period/], 0);
    const timeIdx = headerPresent ? colIndex([/time/], -1) : -1;
    const kwhIdx = colIndex([/kwh|value|consumption|usage/], firstRow.length > 2 ? 2 : 1);

    for (const row of dataRows) {
      let ms: number | null = null;
      if (timeIdx >= 0 && row[dateIdx] && row[timeIdx]) {
        ms = parseTimestamp(`${row[dateIdx]} ${row[timeIdx]}`);
      }
      if (ms === null) ms = parseTimestamp(row[dateIdx] ?? '');
      const kwh = toNumber(row[kwhIdx] ?? '');
      if (ms === null || kwh === null) {
        rejected += 1;
        continue;
      }
      if (kwh <= 0) zeroOrNegative += 1;
      map.set(Math.floor(ms / HALF_HOUR_MS) * HALF_HOUR_MS, Math.max(0, kwh));
    }
  } else {
    for (const row of dataRows) {
      const base = parseTimestamp(row[0] ?? '');
      if (base === null) {
        rejected += 1;
        continue;
      }
      const dayStart = Math.floor(base / DAY_MS) * DAY_MS;
      row.slice(1).forEach((cell, i) => {
        const kwh = toNumber(cell);
        if (kwh === null) return;
        if (kwh <= 0) zeroOrNegative += 1;
        map.set(dayStart + i * HALF_HOUR_MS, Math.max(0, kwh));
      });
    }
  }

  const points: ConsumptionPoint[] = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, kwh]) => ({ from: new Date(ms).toISOString(), kwh }));

  if (points.length === 0) {
    notes.push('No usable half-hourly readings were found.');
    return {
      points,
      quality: { ...emptyQuality, format: long ? 'long' : 'wide', rows: dataRows.length, rejected },
    };
  }

  const first = Date.parse(points[0].from);
  const last = Date.parse(points[points.length - 1].from);
  const days = Math.max(1, Math.floor((last - first) / DAY_MS) + 1);
  const expected = days * 48;
  const coveragePct = Math.min(100, Math.round((points.length / expected) * 100));
  if (coveragePct < 80) notes.push(`Only ${coveragePct}% of half-hourly slots present.`);
  if (zeroOrNegative > 0) notes.push(`${zeroOrNegative} zero readings ignored.`);

  return {
    points,
    quality: {
      format: long ? 'long' : 'wide',
      rows: dataRows.length,
      accepted: points.length,
      rejected,
      first: new Date(first).toISOString(),
      last: new Date(last).toISOString(),
      periods: points.length,
      days,
      coveragePct,
      gaps: Math.max(0, expected - points.length),
      zeroOrNegative,
      notes,
    },
  };
}

