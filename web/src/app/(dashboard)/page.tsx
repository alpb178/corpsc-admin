import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { presetFrom, resolveRange } from '@/lib/ranges';
import { formatMetric } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { TrendChart } from '@/components/charts/TrendChart';
import { ErrorPanel, EmptyState } from '@/components/ErrorPanel';
import type { Overview, ProjectSummary } from '@/lib/types';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; rango?: string }>;
}) {
  const preset = presetFrom(await searchParams);
  const range = resolveRange(preset);

  let data: Overview;
  try {
    data = await api<Overview>('/metrics/overview', { ...range, compare: 'true' });
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudo cargar el resumen"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  const { totals, comparison } = data;
  const hasData = Object.keys(totals).length > 0;

  return (
    <>
      <PageHeader
        title="Resumen del grupo"
        subtitle={`${data.projects.length} sitios`}
        range={data.range}
        preset={preset}
        comparedTo={comparison?.range}
      />

      {!hasData ? (
        <EmptyState
          message="Todavía no ha llegado ningún dato."
          hint="Cada proyecto envía sus agregados diarios al hub. Crea una clave de envío, asígnasela y programa su cron; en Envíos se ve quién ha enviado y cuándo."
        />
      ) : (
        <>
          {/* Seis KPI de primer nivel: los que responden a "cómo va el grupo".
              Baldosas, no gráficos: son números sueltos. */}
          <section aria-label="Indicadores del grupo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Visitas" value={totals.visits} delta={comparison?.deltas.visits} hero />
            <StatTile label="Páginas vistas" value={totals.page_views} delta={comparison?.deltas.page_views} />
            <StatTile label="Pedidos" value={totals.orders} delta={comparison?.deltas.orders} />
            <StatTile label="Contactos" value={totals.leads} delta={comparison?.deltas.leads} />
            <StatTile label="Altas" value={totals.signups} delta={comparison?.deltas.signups} />
            <StatTile
              label="Tasa de conversión"
              value={totals.conversion_rate}
              unit="RATIO"
              delta={comparison?.deltas.conversion_rate}
            />
          </section>

          <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-fg">Sesiones del grupo por día</h2>
            <TrendChart
              data={data.series.map((p) => ({ date: p.date, visits: p.metrics.visits ?? null }))}
              series={[{ key: 'visits', label: 'Visitas', slot: 1 }]}
            />
          </section>

          <Split own={data.split.own.visits ?? 0} client={data.split.client.visits ?? 0} />

          <ProjectsTable projects={data.projects} />
        </>
      )}
    </>
  );
}

/** Propios frente a clientes: distingue "cómo va el producto" de "cómo va el servicio". */
function Split({ own, client }: { own: number; client: number }) {
  const total = own + client;
  if (total === 0) return null;
  const ownPct = own / total;

  return (
    <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">Visitas por tipo de sitio</h2>
        <p className="tabular text-[12px] text-fg-muted">
          Propios {formatMetric(own)} · Clientes {formatMetric(client)}
        </p>
      </div>

      {/* Dos segmentos con un hueco de 2 px entre ellos, para que se lean como
          dos partes y no como una barra continua. */}
      <div className="mt-3 flex h-[10px] gap-[2px] overflow-hidden rounded-[4px]">
        <div
          className="rounded-l-[4px] bg-[var(--series-1)]"
          style={{ width: `${ownPct * 100}%` }}
          title={`Propios: ${formatMetric(own)}`}
        />
        <div
          className="flex-1 rounded-r-[4px] bg-[var(--series-3)]"
          title={`Clientes: ${formatMetric(client)}`}
        />
      </div>
      <p className="mt-2 text-[12px] text-fg-faint">
        {Math.round(ownPct * 100)}% del tráfico del grupo viene de productos propios.
      </p>
    </section>
  );
}

function ProjectsTable({ projects }: { projects: ProjectSummary[] }) {
  const withData = projects.filter((p) => (p.metrics.visits ?? 0) > 0 || (p.metrics.orders ?? 0) > 0);
  const without = projects.length - withData.length;

  const sorted = [...withData].sort((a, b) => (b.metrics.visits ?? 0) - (a.metrics.visits ?? 0));

  return (
    <section className="mt-3 rounded-[6px] border border-line bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Por sitio</h2>
        {without > 0 ? (
          <p className="text-[12px] text-fg-faint">
            {without} {without === 1 ? 'sitio sin datos' : 'sitios sin datos'} en este periodo
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-fg-faint">
              <th scope="col" className="px-4 py-2 font-medium">Sitio</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Visitas</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Páginas</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Pedidos</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Contactos</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Conversión</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.slug} className="border-b border-line last:border-0 hover:bg-elevated">
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <Link href={`/projects/${p.slug}`} className="font-medium text-fg hover:text-accent">
                    {p.name}
                  </Link>
                  <span className="ml-2 text-[11px] text-fg-faint">
                    {p.kind === 'OWN' ? 'propio' : 'cliente'}
                  </span>
                </th>
                <td className="tabular px-4 py-2.5 text-right text-fg">{formatMetric(p.metrics.visits)}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.page_views)}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.orders)}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.leads)}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.conversion_rate, 'RATIO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
