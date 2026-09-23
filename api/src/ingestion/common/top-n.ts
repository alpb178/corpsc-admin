import { OTHER, type MetricRow } from './metric-row';
import type { IsoDate } from './dates';

export interface DimensionBucket {
  dimension: string;
  /** How many values keep their own name. The rest goes to `__other__`. */
  topN: number;
  /** Metric used to rank values when deciding the top. */
  rankBy: string;
}

interface Cell {
  date: IsoDate;
  dimValue: string;
  metrics: Map<string, number>;
  /** Per (cell, metric): an amount is meaningless without its currency. */
  currencies: Map<string, string | undefined>;
}

/**
 * Reduces a breakdown to its top-N per day, summing everything else into `__other__`.
 *
 * The `__other__` bucket isn't cosmetic: without it, `sum(breakdown by country)`
 * doesn't match the aggregate row for the same day, the dashboard shows two
 * different figures for the same thing and it looks like a bug in the code.
 * With it, the breakdown always rebuilds the total.
 *
 * The top is decided PER DAY and not for the whole range, because rows are
 * written per day and reprocessing a window must not depend on which other
 * days came in the same request.
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
      const currencies = new Map<string, Set<string>>();

      for (const cell of rest) {
        for (const [metricKey, value] of cell.metrics) {
          summed.set(metricKey, (summed.get(metricKey) ?? 0) + value);
          const currency = cell.currencies.get(metricKey);
          if (currency) {
            const seen = currencies.get(metricKey) ?? new Set<string>();
            seen.add(currency);
            currencies.set(metricKey, seen);
          }
        }
      }

      for (const [metricKey, value] of summed) {
        // If amounts in several currencies fell into `__other__`, the bucket
        // would be a meaningless sum: it's left without a currency so nobody
        // takes it at face value. In practice it doesn't happen —a project's
        // currencies can be counted on one hand and never leave the top-N.
        const seen = currencies.get(metricKey);
        out.push({
          date: rest[0].date,
          metricKey,
          dimension: bucket.dimension,
          dimValue: OTHER,
          value,
          currency: seen?.size === 1 ? [...seen][0] : undefined,
        });
      }
    }
  }

  return out;
}

/**
 * Normalizes a URL before using it as a `dimValue`.
 *
 * Without this, the same page with different campaign parameters produces
 * dozens of rows that are the same page, and a long URL can overflow the
 * column's 512 characters.
 */
const KEEP_PARAMS = new Set(['page', 'q', 'categoria', 'category']);

export function normalizeUrl(raw: string, ownDomain?: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // A project may send bare paths instead of URLs: they're left as they are.
    return raw.slice(0, 512);
  }

  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEEP_PARAMS.has(key)) params.append(key, value);
  }

  // The project's own host is dropped: on a project's page it's noise repeated
  // on every row. A foreign domain's host is kept.
  const host = ownDomain && url.hostname === ownDomain ? '' : url.hostname;
  const query = params.toString();

  return `${host}${url.pathname}${query ? `?${query}` : ''}`.slice(0, 512);
}
