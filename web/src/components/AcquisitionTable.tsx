import { DataTable, type Deletion } from './DataTable';
import { labelDimension, formatMetric } from '@/lib/format';
import { acquisitionRows } from '@/lib/dashboard';
import type { DimensionSlice } from '@/lib/types';

/**
 * How people arrive and where they land: "Google → búsqueda orgánica →
 * /servicios". The three together, because apart they lose which source
 * brought people to which page.
 */
export function AcquisitionTable({ slices, deletion }: { slices: DimensionSlice[]; deletion?: Omit<Deletion, 'table'> }) {
  const rows = acquisitionRows(slices).map((r) => ({
    id: r.key,
    deleteKey: r.key,
    deleteLabel: `las visitas por ${labelDimension(r.channel)} desde ${labelDimension(r.source)} a ${r.landing}`,
    cells: {
      channel: <span className="text-fg">{labelDimension(r.channel)}</span>,
      source: (
        <span className="block max-w-[12rem] truncate text-fg-muted" title={r.source}>
          {labelDimension(r.source)}
        </span>
      ),
      landing: (
        <span className="block max-w-[16rem] truncate text-fg-muted" title={r.landing}>
          {r.landing}
        </span>
      ),
      visits: <span className="text-fg">{formatMetric(r.visits)}</span>,
    },
  }));

  return (
    <DataTable
      title="Cómo llegan"
      subtitle="Canal, fuente y página de entrada de cada visita."
      columns={[
        { key: 'channel', label: 'Canal' },
        { key: 'source', label: 'Fuente' },
        { key: 'landing', label: 'Entrada' },
        { key: 'visits', label: 'Visitas', align: 'right' },
      ]}
      rows={rows}
      emptyText="Sin datos de entrada en este periodo. Llegan con el tracker v2 del sitio."
      deletion={deletion ? { ...deletion, table: 'acquisition' } : undefined}
    />
  );
}
