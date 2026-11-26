import { DataTable } from './DataTable';
import { formatMetric, labelDimension } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

/** One row of the table: an origin with its visits and the conversions they brought. */
export interface ConversionRow {
  value: string;
  label: string;
  visits: number | undefined;
  conversions: number;
}

/**
 * How an origin reads here. A conversion whose visit couldn't be found has no
 * origin at all, which is not the same as a direct visit: both get a word of
 * their own instead of the generic "Desconocido" / "Directo".
 */
export function labelOrigin(value: string): string {
  if (value === '__unknown__') return 'Sin origen';
  if (value === '__direct__') return '(directo)';
  return labelDimension(value);
}

/**
 * The origins that converted, most conversions first. An origin with visits
 * but no conversion is left out: that's what the "Canales" bars already show.
 */
export function conversionRowsOf(slices: DimensionSlice[]): ConversionRow[] {
  return slices
    .map((slice) => ({
      value: slice.value,
      label: labelOrigin(slice.value),
      visits: slice.metrics.visits,
      conversions: slice.metrics.conversions ?? 0,
    }))
    .filter((row) => row.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions || (b.visits ?? 0) - (a.visits ?? 0));
}

/**
 * Conversions over the visits of the same origin, read from the period's sums
 * —never an average of daily rates—. Without visits there's nothing to divide
 * by: "—", not 0 % nor ∞.
 */
export function formatConversionRate(conversions: number, visits: number | undefined): string {
  if (!visits) return '—';
  return formatMetric(conversions / visits, 'RATIO');
}

/**
 * Which channels and sources bring the visits that convert: the rollup
 * attributes each goal event to the origin of the visit it happened in, so a
 * row reads "Redes sociales, 412 visitas, 9 conversiones, 2,2 %".
 */
export function ConversionsByChannel({ channels, sources }: { channels: DimensionSlice[]; sources: DimensionSlice[] }) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <OriginTable title="Conversiones por canal" column="Canal" slices={channels} />
      <OriginTable title="Conversiones por fuente" column="Fuente" slices={sources} />
    </div>
  );
}

function OriginTable({ title, column, slices }: { title: string; column: string; slices: DimensionSlice[] }) {
  const rows = conversionRowsOf(slices).map((r) => ({
    id: r.value,
    cells: {
      origin: (
        <span className="block max-w-[14rem] truncate text-fg" title={r.label}>
          {r.label}
        </span>
      ),
      visits: <span className="text-fg-muted">{formatMetric(r.visits)}</span>,
      conversions: <span className="text-fg">{formatMetric(r.conversions)}</span>,
      rate: <span className="text-fg-muted">{formatConversionRate(r.conversions, r.visits)}</span>,
    },
  }));

  return (
    <DataTable
      title={title}
      subtitle="Cada conversión cuenta para el origen de la visita en la que ocurrió."
      columns={[
        { key: 'origin', label: column },
        { key: 'visits', label: 'Visitas', align: 'right' },
        { key: 'conversions', label: 'Conversiones', align: 'right' },
        { key: 'rate', label: 'Tasa', align: 'right' },
      ]}
      rows={rows}
      emptyText="Sin conversiones en este periodo."
    />
  );
}
