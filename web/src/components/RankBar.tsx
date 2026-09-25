import { compact, formatMetric, formatShare, labelDimension, type Unit } from '@/lib/format';
import { RankIcon, type RankKind } from './RankIcon';
import type { DimensionSlice } from '@/lib/types';

interface Props {
  title: string;
  slices: DimensionSlice[];
  metricKey: string;
  unit?: Unit;
  /** Secondary metric shown on the right (for example, the CTR). */
  secondary?: { key: string; unit: Unit; label: string };
  limit?: number;
  emptyHint?: string;
  /** How a value reads. Defaults to `labelDimension` (countries, channels, reserved values). */
  labelOf?: (value: string) => string;
  /** What the values are, for the mark next to each one. */
  kind?: RankKind;
}

/**
 * Sorted rows, each filled from the left in proportion to the largest: the
 * bar is the row's background, so name, figure and share read on one line
 * and the eye compares lengths without an axis.
 *
 * A single hue, not eight: the question is "how much", not "which is which",
 * and handing out colours here would spend the categorical palette for
 * nothing. The figure is written on every row and the share says how much of
 * the whole it is, so nothing depends on measuring the fill.
 *
 * In HTML rather than a charting library because long names —a search query,
 * a URL— truncate far better with CSS.
 */
export function RankBar({
  title,
  slices,
  metricKey,
  unit = 'COUNT',
  secondary,
  limit = 8,
  emptyHint,
  labelOf = labelDimension,
  kind,
}: Props) {
  const { rows, total, max } = rankRows(slices, metricKey, limit);

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {rows.length > 0 && unit === 'COUNT' ? (
          <p className="tabular text-[12px] text-fg-faint">{formatMetric(total, unit)} en total</p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">{emptyHint ?? 'Sin datos en este periodo.'}</p>
      ) : (
        <RankList rows={rows} total={total} max={max} unit={unit} secondary={secondary} labelOf={labelOf} kind={kind} className="mt-3" />
      )}

      {secondary && rows.length > 0 ? (
        <p className="mt-3 text-[11px] text-fg-faint">
          La segunda cifra es {secondary.label.toLowerCase()}. Escala relativa al máximo de la lista
          ({compact(max)}).
        </p>
      ) : null}
    </section>
  );
}

export interface RankRow {
  label: string;
  metrics: DimensionSlice['metrics'];
  amount: number;
}

/**
 * The rows worth drawing, the whole they are part of, and the largest one.
 * The share is of everything in the list, the rest included, so the top rows
 * never add up to more than the whole.
 */
export function rankRows(slices: DimensionSlice[], metricKey: string, limit: number): { rows: RankRow[]; total: number; max: number } {
  // `amount` and not `value`: DimensionSlice.value is the dimension's label
  // (the country, the query), and overwriting it would leave the rows nameless.
  const all = slices
    .map((s) => ({ label: s.value, metrics: s.metrics, amount: s.metrics[metricKey] ?? 0 }))
    .filter((r) => r.amount > 0);
  const rows = all.slice(0, limit);
  return {
    rows,
    total: all.reduce((sum, r) => sum + r.amount, 0),
    max: Math.max(...rows.map((r) => r.amount), 1),
  };
}

interface ListProps {
  rows: RankRow[];
  total: number;
  max: number;
  unit?: Unit;
  secondary?: Props['secondary'];
  labelOf?: (value: string) => string;
  kind?: RankKind;
  className?: string;
}

/** The rows alone, for cards that put something else —a map— next to them. */
export function RankList({ rows, total, max, unit = 'COUNT', secondary, labelOf = labelDimension, kind, className = '' }: ListProps) {
  // Only a count adds up; a list of rates has no share.
  const additive = unit === 'COUNT';

  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {rows.map((row, i) => (
        <li key={row.label} className="group relative flex h-8 items-center gap-2 overflow-hidden rounded-[5px] px-2">
          {/* The fill sits behind the text; `animate-grow` stretches it from the left. */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 origin-left rounded-[5px] bg-accent/10 transition-colors animate-grow group-hover:bg-accent/15 motion-reduce:animate-none"
            style={{ width: `${Math.max(2, (row.amount / max) * 100)}%`, animationDelay: `${i * 40}ms` }}
          />

          <span className="relative flex min-w-0 flex-1 items-center gap-2">
            {kind ? <RankIcon kind={kind} value={row.label} /> : null}
            <span className="truncate text-[13px] text-fg" title={labelOf(row.label)}>
              {labelOf(row.label)}
            </span>
          </span>

          <span className="tabular relative flex shrink-0 items-baseline gap-2 text-[13px] font-semibold text-fg">
            {formatMetric(row.amount, unit)}
            {secondary ? (
              <span className="tabular text-[12px] font-normal text-fg-faint">
                {formatMetric(row.metrics[secondary.key], secondary.unit)}
              </span>
            ) : null}
          </span>

          {additive ? (
            <span className="tabular relative w-10 shrink-0 text-right text-[12px] text-fg-faint">
              {formatShare(row.amount / total)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
