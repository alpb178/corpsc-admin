import type { IsoDate } from './dates';

/** Reserved `dimValue` values. They start and end with `__` so they never
 *  clash with a real value (a country, a path, a status). */
export const TOTAL = '__total__';
/** Sum of everything left outside the top-N. */
export const OTHER = '__other__';

export const TOTAL_DIMENSION = 'total';

/** One measure, one day, one cell of a dimension. */
export interface MetricRow {
  date: IsoDate;
  metricKey: string;
  dimension: string;
  dimValue: string;
  value: number;
  currency?: string;
}
