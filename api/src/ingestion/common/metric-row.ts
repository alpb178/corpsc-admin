import type { IsoDate } from './dates';

/** Valores reservados de `dimValue`. Empiezan y acaban en `__` para que nunca
 *  choquen con un valor real (un país, una ruta, un estado). */
export const TOTAL = '__total__';
/** Suma de todo lo que quedó fuera del top-N. */
export const OTHER = '__other__';

export const TOTAL_DIMENSION = 'total';

/** Una medida, un día, una casilla de una dimensión. */
export interface MetricRow {
  date: IsoDate;
  metricKey: string;
  dimension: string;
  dimValue: string;
  value: number;
  currency?: string;
}
