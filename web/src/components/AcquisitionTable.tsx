import { formatMetric, labelDimension } from '@/lib/format';
import { acquisitionRows } from '@/lib/dashboard';
import type { DimensionSlice } from '@/lib/types';

/**
 * How people arrive and where they land: "Google → búsqueda orgánica →
 * /servicios". The three together, because apart they lose which source
 * brought people to which page.
 */
export function AcquisitionTable({ slices, limit = 12 }: { slices: DimensionSlice[]; limit?: number }) {
  const rows = acquisitionRows(slices).slice(0, limit);

  return (
    <section className="card">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Cómo llegan</h2>
        <p className="mt-0.5 text-[12px] text-fg-faint">Canal, fuente y página de entrada de cada visita.</p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-fg-faint">
          Sin datos de entrada en este periodo. Llegan con el tracker v2 del sitio.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-fg-faint">
                <th scope="col" className="px-4 py-2 font-medium">Canal</th>
                <th scope="col" className="px-4 py-2 font-medium">Fuente</th>
                <th scope="col" className="px-4 py-2 font-medium">Entrada</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Visitas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.channel}|${row.source}|${row.landing}`} className="border-b border-line last:border-0 hover:bg-elevated">
                  <td className="px-4 py-2 text-fg">{labelDimension(row.channel)}</td>
                  <td className="max-w-[12rem] truncate px-4 py-2 text-fg-muted" title={row.source}>
                    {labelDimension(row.source)}
                  </td>
                  <td className="max-w-[14rem] truncate px-4 py-2 text-fg-muted" title={row.landing}>
                    {labelDimension(row.landing)}
                  </td>
                  <td className="tabular px-4 py-2 text-right text-fg">{formatMetric(row.visits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
