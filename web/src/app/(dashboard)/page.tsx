import { api, ApiError } from '@/lib/api';
import { DEFAULT_PRESET, presetFrom, resolveRange } from '@/lib/ranges';
import { formatMetric } from '@/lib/format';
import { metricTrend, topPageSlices, trafficByProject, visitorsHint, visitsAndVisitors } from '@/lib/dashboard';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { RankBar } from '@/components/RankBar';
import { TrendChart } from '@/components/charts/TrendChart';
import { ErrorPanel, EmptyState } from '@/components/ErrorPanel';
import { RealtimePanel } from '@/components/RealtimePanel';
import { ProjectCards } from '@/components/ProjectCards';
import { AutoRefresh } from '@/components/AutoRefresh';
import type { Overview, RealtimeSnapshot } from '@/lib/types';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; rango?: string }>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = resolveRange(preset);
  // Only an explicit preset travels in the links: the default stays clean.
  const rangeParam = params.range ?? params.rango ? preset : preset === DEFAULT_PRESET ? null : preset;

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
        aside={<AutoRefresh />}
      />

      {!hasData ? (
        <EmptyState
          message="Todavía no ha llegado ningún dato en este periodo."
          hint="Cada sitio manda sus eventos al hub con el tracker compartido. En Envíos se ve quién ha enviado y cuándo."
        />
      ) : (
        <>
          {/* The figures that answer "how is the group doing", each with its
              change and the shape of its days. A metric nobody sends here
              (conversions without goals) isn't drawn as a zero. */}
          <section aria-label="Indicadores del grupo" className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Visitas"
              hint="sesiones"
              value={totals.visits}
              delta={comparison?.deltas.visits}
              trend={metricTrend(data.series, 'visits')}
              hero
            />
            <StatTile
              label="Visitantes únicos"
              hint={visitorsHint(visitors.since, data.range.from)}
              value={visitors.since ? visitors.unique : undefined}
              delta={visitors.since ? comparison?.deltas.unique_visitors : undefined}
              trend={visitors.since ? visitors.daily : undefined}
            />
            <StatTile
              label="Páginas vistas"
              value={totals.page_views}
              delta={comparison?.deltas.page_views}
              trend={metricTrend(data.series, 'page_views')}
            />
            <StatTile
              label="Clics"
              value={totals.clicks}
              delta={comparison?.deltas.clicks}
              trend={metricTrend(data.series, 'clicks')}
            />
            {totals.conversions !== undefined ? (
              <StatTile
                label="Conversiones"
                value={totals.conversions}
                delta={comparison?.deltas.conversions}
                trend={metricTrend(data.series, 'conversions')}
              />
            ) : null}
            <StatTile label="Proyectos activos" value={counts.activeProjects} hint={`de ${data.projects.length}`} />
            <StatTile label="Países" value={counts.countries} />
            <StatTile label="Fuentes" value={counts.sources} />
          </section>

          <ProjectCards overview={data} range={rangeParam} />

          <div className="mt-6">
            <RealtimePanel initial={initialLive} />
          </div>

          <section className="card mt-3 p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-fg">
              {trend.series.length > 1 ? 'Visitas y visitantes por día' : 'Visitas por día'}
            </h2>
            <TrendChart data={trend.data} series={trend.series} />
          </section>

          {byProject.series.length > 0 ? (
            <section className="card mt-3 p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-fg">Visitas por proyecto</h2>
              <TrendChart data={byProject.data} series={byProject.series} />
            </section>
          ) : null}

          <h2 className="mb-2 mt-6 text-[15px] font-semibold text-fg">Procedencia</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <RankBar title="Países" slices={breakdowns.country} metricKey="visits" kind="country" />
            <RankBar title="Canales" slices={breakdowns.channel} metricKey="visits" kind="channel" />
            <RankBar title="Fuentes" slices={breakdowns.source} metricKey="visits" kind="source" />
            <RankBar
              title="Dispositivos"
              slices={breakdowns.device}
              metricKey="visits"
              kind="device"
              limit={4}
              emptyHint="Llega con el tracker v2 de cada sitio."
            />
          </div>

          <h2 className="mb-2 mt-6 text-[15px] font-semibold text-fg">Contenido</h2>
          <div className="grid gap-3 lg:grid-cols-2">
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
    <section className="card mt-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">Visitas por tipo de sitio</h2>
        <p className="tabular text-[12px] text-fg-muted">
          Propios {formatMetric(own)} · Clientes {formatMetric(client)}
        </p>
      </div>
      <div className="mt-3 flex h-[10px] gap-[2px] overflow-hidden rounded-[4px]">
        <div
          className="origin-left rounded-l-[4px] bg-[var(--series-1)] transition-[width] duration-700 ease-out"
          style={{ width: `${ownPct * 100}%` }}
        />
        <div className="flex-1 rounded-r-[4px] bg-[var(--series-3)]" />
      </div>
      <p className="mt-2 text-[12px] text-fg-faint">
        {Math.round(ownPct * 100)}% del tráfico del grupo viene de productos propios.
      </p>
    </section>
  );
}
