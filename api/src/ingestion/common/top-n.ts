import { OTHER, type MetricRow } from './metric-row';
import type { IsoDate } from './dates';

export interface DimensionBucket {
  dimension: string;
  /** Cuántos valores se conservan con nombre propio. El resto va a `__other__`. */
  topN: number;
  /** Métrica por la que se ordena para decidir el top. */
  rankBy: string;
}

interface Cell {
  date: IsoDate;
  dimValue: string;
  metrics: Map<string, number>;
  /** Por (celda, métrica): un importe pierde sentido sin su moneda. */
  currencies: Map<string, string | undefined>;
}

/**
 * Reduce un desglose a su top-N por día, sumando todo lo demás en `__other__`.
 *
 * El bucket `__other__` no es cosmético: sin él, `sum(desglose por país)` no
 * coincide con la fila agregada del mismo día, el dashboard muestra dos cifras
 * distintas para lo mismo y parece un bug del código. Con él, el desglose
 * siempre reconstruye el total.
 *
 * El top se decide POR DÍA y no para el rango entero, porque las filas se
 * escriben por día y reprocesar una ventana no debe depender de qué otros días
 * venían en la misma petición.
 */
export function collapseToTopN(rows: MetricRow[], bucket: DimensionBucket): MetricRow[] {
  const byDate = new Map<IsoDate, Map<string, Cell>>();

  for (const row of rows) {
    if (row.dimension !== bucket.dimension) continue;

    let cells = byDate.get(row.date);
    if (!cells) byDate.set(row.date, (cells = new Map()));

    let cell = cells.get(row.dimValue);
    if (!cell) {
      cells.set(
        row.dimValue,
        (cell = { date: row.date, dimValue: row.dimValue, metrics: new Map(), currencies: new Map() }),
      );
    }

    cell.metrics.set(row.metricKey, (cell.metrics.get(row.metricKey) ?? 0) + row.value);
    if (row.currency) cell.currencies.set(row.metricKey, row.currency);
  }

  const out: MetricRow[] = [];

  for (const cells of byDate.values()) {
    const ranked = [...cells.values()].sort(
      (a, b) => (b.metrics.get(bucket.rankBy) ?? 0) - (a.metrics.get(bucket.rankBy) ?? 0),
    );

    const kept = ranked.slice(0, bucket.topN);
    const rest = ranked.slice(bucket.topN);

    for (const cell of kept) {
      for (const [metricKey, value] of cell.metrics) {
        out.push({
          date: cell.date,
          metricKey,
          dimension: bucket.dimension,
          dimValue: cell.dimValue,
          value,
          currency: cell.currencies.get(metricKey),
        });
      }
    }

    if (rest.length > 0) {
      const summed = new Map<string, number>();
      const monedas = new Map<string, Set<string>>();

      for (const cell of rest) {
        for (const [metricKey, value] of cell.metrics) {
          summed.set(metricKey, (summed.get(metricKey) ?? 0) + value);
          const moneda = cell.currencies.get(metricKey);
          if (moneda) {
            const vistas = monedas.get(metricKey) ?? new Set<string>();
            vistas.add(moneda);
            monedas.set(metricKey, vistas);
          }
        }
      }

      for (const [metricKey, value] of summed) {
        // Si en `__other__` cayeran importes de varias monedas, el bucket sería
        // una suma sin significado: se queda sin moneda para que nadie lo tome
        // por buena. En la práctica no pasa —las monedas de un proyecto se
        // cuentan con los dedos de una mano y nunca salen del top-N.
        const vistas = monedas.get(metricKey);
        out.push({
          date: rest[0].date,
          metricKey,
          dimension: bucket.dimension,
          dimValue: OTHER,
          value,
          currency: vistas?.size === 1 ? [...vistas][0] : undefined,
        });
      }
    }
  }

  return out;
}

/**
 * Normaliza una URL antes de usarla como `dimValue`.
 *
 * Sin esto, la misma página con distintos parámetros de campaña genera decenas
 * de filas que son la misma página, y una URL larga puede desbordar los 512
 * caracteres de la columna.
 */
const KEEP_PARAMS = new Set(['page', 'q', 'categoria', 'category']);

export function normalizeUrl(raw: string, ownDomain?: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Un proyecto puede mandar rutas sueltas en vez de URLs: se dejan igual.
    return raw.slice(0, 512);
  }

  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEEP_PARAMS.has(key)) params.append(key, value);
  }

  // El host propio se omite: en la ficha de un proyecto es ruido repetido en
  // todas las filas. El de un dominio ajeno sí se conserva.
  const host = ownDomain && url.hostname === ownDomain ? '' : url.hostname;
  const query = params.toString();

  return `${host}${url.pathname}${query ? `?${query}` : ''}`.slice(0, 512);
}
