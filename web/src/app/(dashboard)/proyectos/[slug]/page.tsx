import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { presetFrom, resolveRange } from '@/lib/ranges';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { RankBar } from '@/components/RankBar';
import { TrendChart } from '@/components/charts/TrendChart';
import { ErrorPanel, EmptyState } from '@/components/ErrorPanel';
import { BusinessKpis } from '@/components/BusinessKpis';
import { FreshnessBadge } from '@/components/FreshnessBadge';
import { SiteNavigation } from '@/components/SiteNavigation';
import { HourlyActivity } from '@/components/HourlyActivity';
import type { Freshness, ProjectDetail } from '@/lib/types';

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rango?: string }>;
}) {
  const { slug } = await params;
  const preset = presetFrom(await searchParams);
  const range = resolveRange(preset);

  let data: ProjectDetail;
  try {
    data = await api<ProjectDetail>(`/metrics/projects/${slug}`, { ...range, compare: 'true' });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <ErrorPanel
        title="No se pudo cargar el sitio"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  const { project, totals, comparison, series, breakdowns } = data;
  const hasData = (totals.visits ?? 0) > 0 || (totals.orders ?? 0) > 0;

  const chartData = series.map((point) => ({
    date: point.date,
    visits: point.metrics.visits ?? null,
  }));

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.domain}
        range={data.range}
        preset={preset}
        comparedTo={comparison?.range}
      />

      <PushStatus
        lastPushAt={project.lastPushAt}
        freshness={project.freshness}
        hoursSince={project.hoursSince}
      />

      {!hasData ? (
        <EmptyState
          message={`Sin datos de ${project.name} en este periodo.`}
          hint="Comprueba arriba cuándo envió por última vez: si lleva días callado, el problema está en su cron, no en el periodo elegido."
        />
      ) : (
        <>
          <section aria-label="Indicadores del sitio" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Visitas" value={totals.visits} delta={comparison?.deltas.visits} />
            <StatTile label="Páginas vistas" value={totals.page_views} delta={comparison?.deltas.page_views} />
            <StatTile label="Clics" value={totals.clicks} delta={comparison?.deltas.clicks} />
            <StatTile
              label="Páginas por visita"
              value={totals.pages_per_visit}
              unit="RATIO"
              delta={comparison?.deltas.pages_per_visit}
            />
          </section>

          <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
            {/* Una sola serie: sin leyenda, el título la nombra. */}
            <h2 className="mb-3 text-[13px] font-semibold text-fg">Visitas por día</h2>
            <TrendChart data={chartData} series={[{ key: 'visits', label: 'Visitas', slot: 1 }]} />
          </section>

          <SiteNavigation pages={breakdowns.path} elements={breakdowns.element ?? []} />

          {/* De dónde y cuándo llegan las visitas. */}
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <RankBar title="Países" slices={breakdowns.country} metricKey="visits" />
            <RankBar title="Canales" slices={breakdowns.channel} metricKey="visits" />
            <RankBar title="Fuentes" slices={breakdowns.source} metricKey="visits" />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <HourlyActivity slices={breakdowns.hour} timezone={project.timezone} />
            </div>
            <RankBar
              title="Campañas"
              slices={breakdowns.campaign}
              metricKey="visits"
              emptyHint="Ninguna visita llegó con utm_campaign en este periodo."
            />
          </div>

          {/* Solo los proyectos que empujan agregados mandan el dispositivo:
              los beacons no leen el agente de usuario, a propósito. */}
          {breakdowns.device.length > 0 ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <RankBar title="Dispositivos" slices={breakdowns.device} metricKey="visits" limit={5} />
            </div>
          ) : null}

          <BusinessKpis totals={totals} comparison={comparison} />

        </>
      )}
    </>
  );
}

/** Cuándo envió este proyecto por última vez. Va arriba porque es la primera
 *  explicación de una gráfica vacía: el dato no cayó, el envío dejó de llegar.
 *  La clasificación la hace la API — el reloj del navegador puede estar mal. */
function PushStatus({
  lastPushAt,
  freshness,
  hoursSince,
}: {
  lastPushAt: string | null;
  freshness: Freshness;
  hoursSince: number | null;
}) {
  if (!lastPushAt) {
    return (
      <p className="mb-4 rounded-[6px] border border-dashed border-line bg-card px-4 py-2.5 text-[12px] text-fg-faint">
        Este proyecto todavía no ha enviado nada.
      </p>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 text-[12px]">
      <span className="text-fg-muted">Último envío:</span>
      <FreshnessBadge freshness={freshness} hoursSince={hoursSince} />
    </div>
  );
}
