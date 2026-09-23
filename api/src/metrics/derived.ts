import type { Aggregation, MetricUnit } from '@prisma/client';

/**
 * Metric definition as the read layer needs it.
 * It's the in-memory mirror of the `metric_definition` table.
 */
export interface MetricMeta {
  key: string;
  label: string;
  unit: MetricUnit;
  aggregation: Aggregation;
  derivedFrom: { numerator: string; denominator: string } | null;
}

export type MetricTotals = Record<string, number>;

/**
 * Adds the derived metrics to a set of already-summed totals.
 *
 * This function is the reason for the "only additive measures are persisted"
 * rule. A conversion rate stored per day can't be averaged across days: the
 * mean of the daily rates is NOT the period's rate, because each day weighs
 * differently. Here it's computed over the sums, which is the only correct
 * way:
 *
 *   conversion_rate = Σ orders / Σ visits
 *   pages_per_visit = Σ pages / Σ visits
 */
export function withDerived(totals: MetricTotals, definitions: MetricMeta[]): MetricTotals {
  const out: MetricTotals = { ...totals };

  for (const def of definitions) {
    if (!def.derivedFrom) continue;

    const numerator = totals[def.derivedFrom.numerator];
    const denominator = totals[def.derivedFrom.denominator];

    // No denominator, no ratio. Returning 0 would be lying: "0% CTR" and
    // "there were no impressions" are different things, and the dashboard must
    // be able to tell them apart so it doesn't draw a drop that never existed.
    if (!denominator) continue;

    // A MISSING numerator isn't a zero numerator either. It really happens: a
    // project sends visits but no orders because nothing is sold there.
    // Without this check the panel would show "conversion rate 0%", which
    // suggests someone tried to sell and didn't — and that's not it.
    if (numerator === undefined) continue;

    out[def.key] = numerator / denominator;
  }

  return out;
}

/** Relative change between two periods. */
export interface Delta {
  current: number;
  previous: number;
  /** Fraction: 0.12 is +12%. `null` when it can't be computed. */
  change: number | null;
}

/**
 * Compares two periods metric by metric.
 *
 * When the previous period is 0 it returns neither "+∞" nor "+100%": going
 * from 0 to 5 isn't a percentage, it's an appearance, and the dashboard must
 * present it as such instead of with a giant green arrow.
 */
export function compare(current: MetricTotals, previous: MetricTotals): Record<string, Delta> {
  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const out: Record<string, Delta> = {};

  for (const key of keys) {
    const now = current[key] ?? 0;
    const before = previous[key] ?? 0;
    out[key] = { current: now, previous: before, change: before === 0 ? null : (now - before) / before };
  }

  return out;
}

/**
 * Metrics where "less is better": a decrease is good news.
 *
 * Without this the panel would paint a rise in cancellations green. Any new
 * metric of this kind —returns, bounces, incidents— must be added here or it
 * will read backwards.
 */
const LOWER_IS_BETTER = new Set(['orders_cancelled']);

export function isImprovement(metricKey: string, change: number | null): boolean | null {
  if (change === null || change === 0) return null;
  return LOWER_IS_BETTER.has(metricKey) ? change < 0 : change > 0;
}
