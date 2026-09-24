import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { presetFrom, resolveRange } from '@/lib/ranges';
import { formatMetric } from '@/lib/format';
import { topPageSlices, trafficByProject, visitorsHint, visitsAndVisitors } from '@/lib/dashboard';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { RankBar } from '@/components/RankBar';
import { TrendChart } from '@/components/charts/TrendChart';
import { ErrorPanel, EmptyState } from '@/components/ErrorPanel';
import { RealtimePanel } from '@/components/RealtimePanel';
import type { Overview, ProjectSummary, RealtimeSnapshot } from '@/lib/types';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; rango?: string }>;
}) {
  const preset = presetFrom(await searchParams);
  const range = resolveRange(preset);

  // Real time is a bonus: if it fails, the dashboard still opens.
  const live = api<RealtimeSnapshot>('/metrics/realtime').catch(() => null);

  let data: Overview;
  try {
    data = await api<Overview>('/metrics/overview', { ...range, compare: 'true' });
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudo cargar el dashboard"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  const { totals, comparison, visitors, counts, breakdowns } = data;
  const initialLive = await live;
  const hasData = Object.keys(totals).length > 0;
  const trend = visitsAndVisitors(data);
  const byProject = trafficByProject(
    data.seriesByProject,
    data.projects.map((p) => p.slug),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${data.projects.length} sitios`}
        range={data.range}
        preset={preset}
        comparedTo={comparison?.range}
      />

      {!hasData ? (
        <EmptyState
          message="Todavía no ha llegado ningún dato en este periodo."
          hint="Cada sitio manda sus eventos al hub con el tracker compartido. En Envíos se ve quién ha enviado y cuándo."
        />
      ) : (
        <>
          {/* The figures that answer "how is the group doing". Tiles, not
              charts: they're standalone numbers. A metric nobody sends here
              (conversions without goals) isn't drawn as a zero. */}
          <section aria-label="Indicadores del grupo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Visitas" hint="sesiones" value={totals.visits} delta={comparison?.deltas.visits} hero />
            <StatTile
              label="Visitantes únicos"
              hint={visitorsHint(visitors.since, data.range.from)}
              value={visitors.since ? visitors.unique : undefined}
              delta={visitors.since ? comparison?.deltas.unique_visitors : undefined}
            />
            <StatTile label="Páginas vistas" value={totals.page_views} delta={comparison?.deltas.page_views} />
            <StatTile label="Clics" value={totals.clicks} delta={comparison?.deltas.clicks} />
            {totals.conversions !== undefined ? (
              <StatTile label="Conversiones" value={totals.conversions} delta={comparison?.deltas.conversions} />
            ) : null}
            <StatTile label="Proyectos activos" value={counts.activeProjects} hint={`de ${data.projects.length}`} />
            <StatTile label="Países" value={counts.countries} />
            <StatTile label="Fuentes" value={counts.sources} />
          </section>

          <div className="mt-3">
            <RealtimePanel initial={initialLive} />
          </div>

          <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-fg">
              {trend.series.length > 1 ? 'Visitas y visitantes por día' : 'Visitas por día'}
            </h2>
            <TrendChart data={trend.data} series={trend.series} />
          </section>

          {byProject.series.length > 0 ? (
            <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-fg">Visitas por proyecto</h2>
              <TrendChart data={byProject.data} series={byProject.series} />
            </section>
          ) : null}

          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <RankBar title="Países" slices={breakdowns.country} metricKey="visits" />
            <RankBar title="Canales" slices={breakdowns.channel} metricKey="visits" />
            <RankBar title="Fuentes" slices={breakdowns.source} metricKey="visits" />
            <RankBar
              title="Dispositivos"
              slices={breakdowns.device}
              metricKey="visits"
              limit={4}
              emptyHint="Llega con el tracker v2 de cada sitio."
            />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <RankBar title="Páginas más visitadas" slices={topPageSlices(data.topPages)} metricKey="page_views" limit={10} />
            <RankBar
              title="Eventos más usados"
              slices={breakdowns.event}
              metricKey="custom_events"
              limit={10}
              emptyHint="Ningún sitio ha enviado eventos propios en este periodo (track())."
            />
          </div>

          {data.split.client.visits ? (
            <Split own={data.split.own.visits ?? 0} client={data.split.client.visits} />
          ) : null}

          <ProjectsTable projects={data.projects} />
        </>
      )}
    </>
  );
}

/** Own versus client sites. Only drawn when there are client sites to split. */
function Split({ own, client }: { own: number; client: number }) {
  const total = own + client;
  const ownPct = own / total;

  return (
    <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">Visitas por tipo de sitio</h2>
        <p className="tabular text-[12px] text-fg-muted">
          Propios {formatMetric(own)} · Clientes {formatMetric(client)}
        </p>
      </div>
      <div className="mt-3 flex h-[10px] gap-[2px] overflow-hidden rounded-[4px]">
        <div className="rounded-l-[4px] bg-[var(--series-1)]" style={{ width: `${ownPct * 100}%` }} />
        <div className="flex-1 rounded-r-[4px] bg-[var(--series-3)]" />
      </div>
      <p className="mt-2 text-[12px] text-fg-faint">
        {Math.round(ownPct * 100)}% del tráfico del grupo viene de productos propios.
      </p>
    </section>
  );
}

function ProjectsTable({ projects }: { projects: ProjectSummary[] }) {
  const withData = projects.filter((p) => (p.metrics.visits ?? 0) > 0);
  const without = projects.length - withData.length;
  const sorted = [...withData].sort((a, b) => (b.metrics.visits ?? 0) - (a.metrics.visits ?? 0));
  // A column only if some site measures it: "Conversiones —" on every row says nothing.
  const showConversions = withData.some((p) => p.metrics.conversions !== undefined);

  return (
    <section className="mt-3 rounded-[6px] border border-line bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Por proyecto</h2>
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
              <th scope="col" className="px-4 py-2 text-right font-medium">Clics</th>
              {showConversions ? <th scope="col" className="px-4 py-2 text-right font-medium">Conversiones</th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.slug} className="border-b border-line last:border-0 hover:bg-elevated">
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <Link href={`/projects/${p.slug}`} className="font-medium text-fg hover:text-accent">
                    {p.name}
                  </Link>
                </th>
                <td className="tabular px-4 py-2.5 text-right text-fg">{formatMetric(p.metrics.visits)}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.page_views)}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.clicks)}</td>
                {showConversions ? (
                  <td className="tabular px-4 py-2.5 text-right text-fg-muted">{formatMetric(p.metrics.conversions)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
