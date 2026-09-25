import { formatMetric } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

/**
 * The site's custom events, with the conversions among them on the same row.
 * A goal is marked in the hub, not in the site, so the "Conversiones" column
 * only appears once the project has goals.
 */
export function EventsTable({ slices }: { slices: DimensionSlice[] }) {
  const rows = slices.filter((s) => s.value !== '__other__' && (s.metrics.custom_events ?? 0) > 0);
  const hasGoals = rows.some((r) => r.metrics.conversions !== undefined);

  return (
    <section className="card">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Eventos y conversiones</h2>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-fg-faint">
          El sitio no ha enviado eventos propios en este periodo. Se envían con{' '}
          <code className="rounded bg-elevated px-1 text-[12px]">track(&apos;nombre&apos;)</code> del tracker.
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-fg-faint">
              <th scope="col" className="px-4 py-2 font-medium">Evento</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Veces</th>
              {hasGoals ? <th scope="col" className="px-4 py-2 text-right font-medium">Conversiones</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value} className="border-b border-line last:border-0 hover:bg-elevated">
                <th scope="row" className="px-4 py-2 text-left font-mono text-[12px] font-normal text-fg">
                  {row.value}
                </th>
                <td className="tabular px-4 py-2 text-right text-fg">{formatMetric(row.metrics.custom_events)}</td>
                {hasGoals ? (
                  <td className="tabular px-4 py-2 text-right text-fg-muted">
                    {row.metrics.conversions === undefined ? '—' : formatMetric(row.metrics.conversions)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
