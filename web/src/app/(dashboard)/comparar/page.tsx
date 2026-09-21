import { api, ApiError } from '@/lib/api';
import { presetFrom, resolveRange } from '@/lib/ranges';
import { PageHeader } from '@/components/PageHeader';
import { TrendChart, type TrendSeries } from '@/components/charts/TrendChart';
import { ErrorPanel, EmptyState } from '@/components/ErrorPanel';
import { ProjectPicker } from '@/components/ProjectPicker';
import { formatMetric } from '@/lib/format';
import { assignSlots, MAX_SERIES } from '@/lib/series-slots';
import type { CompareView, Overview } from '@/lib/types';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; sitios?: string }>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = resolveRange(preset);

  let overview: Overview;
  try {
    overview = await api<Overview>('/metrics/overview', range);
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudo cargar la lista de sitios"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  const withData = overview.projects.filter((p) => (p.metrics.visits ?? 0) > 0);

  // Por defecto, los cuatro con más tráfico: una gráfica que arranca con
  // catorce líneas no se lee.
  const selected = (params.sitios?.split(',').filter(Boolean) ??
    withData
      .slice()
      .sort((a, b) => (b.metrics.visits ?? 0) - (a.metrics.visits ?? 0))
      .slice(0, 4)
      .map((p) => p.slug)
  ).slice(0, MAX_SERIES);

  return (
    <>
      <PageHeader title="Comparar sitios" subtitle="Visitas por día" range={range} preset={preset} />

      <ProjectPicker projects={withData} selected={selected} max={MAX_SERIES} />

      {selected.length === 0 ? (
        <EmptyState message="Elige al menos un sitio para comparar." />
      ) : (
        <CompareChart
          slugs={selected}
          canonicalOrder={overview.projects.map((p) => p.slug)}
          range={range}
        />
      )}
    </>
  );
}

async function CompareChart({
  slugs,
  canonicalOrder,
  range,
}: {
  slugs: string[];
  canonicalOrder: string[];
  range: { from: string; to: string };
}) {
  let data: CompareView;
  try {
    data = await api<CompareView>('/metrics/compare', {
      ...range,
      slugs: slugs.join(','),
      metric: 'visits',
    });
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudo comparar"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  // El color se asigna por sitio, no por su posición en el array: si se quita
  // uno de la selección, los demás NO cambian de color.
  const slots = assignSlots(slugs, canonicalOrder);

  const series: TrendSeries[] = data.series.map((s) => ({
    key: s.slug,
    label: s.name,
    slot: slots.get(s.slug) ?? 1,
  }));

  const dates = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const rows = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const s of data.series) {
      const point = s.points.find((p) => p.date === date);
      if (point) row[s.slug] = point.value;
    }
    return row;
  });

  return (
    <>
      <section className="mt-4 rounded-[6px] border border-line bg-card p-4">
        <TrendChart data={rows} series={series} height={320} />
      </section>

      {/* Vista de tabla: la identidad de cada sitio no debe depender de
          distinguir colores en la gráfica. */}
      <section className="mt-3 overflow-x-auto rounded-[6px] border border-line bg-card">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Sesiones totales por sitio en el periodo</caption>
          <thead>
            <tr className="border-b border-line text-left text-fg-faint">
              <th scope="col" className="px-4 py-2 font-medium">Sitio</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Media diaria</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Máximo</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((s) => {
              const values = s.points.map((p) => p.value);
              const total = values.reduce((n, v) => n + v, 0);
              return (
                <tr key={s.slug} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-[3px] w-4 rounded-full"
                        style={{ background: `var(--series-${slots.get(s.slug) ?? 1})` }}
                      />
                      <span className="font-medium text-fg">{s.name}</span>
                    </span>
                  </th>
                  <td className="tabular px-4 py-2.5 text-right text-fg">{formatMetric(total)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-fg-muted">
                    {formatMetric(values.length ? total / values.length : 0)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-fg-muted">
                    {formatMetric(values.length ? Math.max(...values) : 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
