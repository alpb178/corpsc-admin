import { DataTable, type Deletion } from './DataTable';
import { formatMetric, formatShare, labelDimension } from '@/lib/format';
import type { DimensionSlice, RecordTable } from '@/lib/types';

interface Props {
  title: string;
  subtitle?: string;
  slices: DimensionSlice[];
  emptyText: string;
  /** Which table these paths are, for a deletion. */
  table: Extract<RecordTable, 'landing' | 'exit'>;
  deletion?: Omit<Deletion, 'table'>;
}

/**
 * Pages with their visits and share: where visits began, or where they
 * ended. "Resto" —the tail past the top-100 the hub keeps— is a bucket,
 * not a page, so it can't be deleted.
 */
export function PathTable({ title, subtitle, slices, emptyText, table, deletion }: Props) {
  const all = slices.map((s) => ({ value: s.value, visits: s.metrics.visits ?? 0 })).filter((r) => r.visits > 0);
  const total = all.reduce((sum, r) => sum + r.visits, 0);

  const rows = all.map((r) => {
    const reserved = r.value.startsWith('__');
    return {
      id: r.value,
      ...(reserved ? {} : { deleteKey: r.value, deleteLabel: `las visitas que ${table === 'landing' ? 'entraron por' : 'salieron desde'} ${r.value}` }),
      cells: {
        path: (
          <span className={`block max-w-[24rem] truncate ${reserved ? 'text-fg-faint' : 'text-fg'}`} title={r.value}>
            {reserved ? labelDimension(r.value) : r.value}
          </span>
        ),
        visits: <span className="text-fg">{formatMetric(r.visits)}</span>,
        share: <span className="text-fg-faint">{formatShare(r.visits / total)}</span>,
      },
    };
  });

  return (
    <DataTable
      title={title}
      subtitle={subtitle}
      columns={[
        { key: 'path', label: 'Página' },
        { key: 'visits', label: 'Visitas', align: 'right' },
        { key: 'share', label: '%', align: 'right' },
      ]}
      rows={rows}
      emptyText={emptyText}
      deletion={deletion ? { ...deletion, table } : undefined}
    />
  );
}
