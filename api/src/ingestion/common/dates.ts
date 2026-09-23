/**
 * Date utilities for ingestion.
 *
 * The whole hub reasons in CALENDAR days in the project's timezone, not in UTC
 * nor in instants. A JavaScript `Date` is an instant, so dates travel as
 * 'YYYY-MM-DD' strings through the whole ingestion layer and are only turned
 * into a `Date` when writing to Postgres (a `date` column, with no time).
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  // Rejects dates that are well-formed but don't exist (2026-02-31).
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Today's date in the given timezone. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  // 'en-CA' formats as YYYY-MM-DD, which is exactly what we need.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Days between two dates (b − a). Negative if b is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Converts to a `Date` at UTC midnight, which is how Postgres stores a `date`. */
export function toUtcDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Splits a range into chunks of at most `size` days, inclusive. */
export function chunkRange(from: IsoDate, to: IsoDate, size: number): Array<[IsoDate, IsoDate]> {
  if (size < 1) throw new Error('Chunk size must be at least 1');

  const chunks: Array<[IsoDate, IsoDate]> = [];
  let start = from;
  while (start <= to) {
    const end = minDate(addDays(start, size - 1), to);
    chunks.push([start, end]);
    start = addDays(end, 1);
  }
  return chunks;
}
