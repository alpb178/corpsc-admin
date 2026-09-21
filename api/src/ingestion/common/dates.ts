/**
 * Utilidades de fecha para la ingesta.
 *
 * Todo el hub razona en días CALENDARIO de la zona horaria del proyecto, no en
 * UTC ni en instantes. Un `Date` de JavaScript es un instante, así que las
 * fechas viajan como cadenas 'YYYY-MM-DD' por toda la capa de ingesta y solo se
 * convierten a `Date` al escribir en Postgres (columna `date`, sin hora).
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  // Descarta fechas con forma válida pero inexistentes (2026-02-31).
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Día de hoy en la zona horaria indicada. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  // 'en-CA' formatea como YYYY-MM-DD, que es justo lo que necesitamos.
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

/** Días entre dos fechas (b − a). Negativo si b es anterior. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Convierte a `Date` en medianoche UTC, que es como Postgres guarda un `date`. */
export function toUtcDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Trocea un rango en bloques de como mucho `size` días, inclusive. */
export function chunkRange(from: IsoDate, to: IsoDate, size: number): Array<[IsoDate, IsoDate]> {
  if (size < 1) throw new Error('El tamaño de bloque debe ser al menos 1');

  const chunks: Array<[IsoDate, IsoDate]> = [];
  let start = from;
  while (start <= to) {
    const end = minDate(addDays(start, size - 1), to);
    chunks.push([start, end]);
    start = addDays(end, 1);
  }
  return chunks;
}
