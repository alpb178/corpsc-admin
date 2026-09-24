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
import { AcquisitionTable } from '@/components/AcquisitionTable';
import { EventsTable } from '@/components/EventsTable';
import { RealtimePanel } from '@/components/RealtimePanel';
import { visitorsHint, visitsAndVisitors } from '@/lib/dashboard';
import { formatMetric, labelLanguage, labelRegion, labelScreen } from '@/lib/format';
import type { Freshness, ProjectDetail, RealtimeSnapshot } from '@/lib/types';

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; rango?: string }>;
}) {
  const { slug } = await params;
  const preset = presetFrom(await searchParams);
  const range = resolveRange(preset);

  // Real time is a bonus: if it fails, the page still opens.
  const live = api<RealtimeSnapshot>('/metrics/realtime', { project: slug }).catch(() => null);

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

  const { project, totals, comparison, visitors, breakdowns } = data;
  const initialLive = await live;
  const hasData = (totals.visits ?? 0) > 0 || (totals.orders ?? 0) > 0;
  const trend = visitsAndVisitors(data);

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
          hint="Comprueba arriba cuándo envió por última vez: si lleva días callado, el problema está en el tracker del sitio, no en el periodo elegido."
        />
      ) : (
        <>
          <section aria-label="Indicadores del sitio" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Visitas" hint="sesiones" value={totals.visits} delta={comparison?.deltas.visits} />
            <StatTile
              label="Visitantes únicos"
              hint={
                visitors.since
                  ? `${formatMetric(visitors.new)} nuevos · ${formatMetric(visitors.returning)} recurrentes`
                  : visitorsHint(null, data.range.from)
              }
              value={visitors.since ? visitors.unique : undefined}
              delta={visitors.since ? comparison?.deltas.unique_visitors : undefined}
            />
            <StatTile label="Páginas vistas" value={totals.page_views} delta={comparison?.deltas.page_views} />
            <StatTile label="Clics" value={totals.clicks} delta={comparison?.deltas.clicks} />
            <StatTile
              label="Páginas por visita"
              value={totals.pages_per_visit}
              unit="AVERAGE"
              delta={comparison?.deltas.pages_per_visit}
            />
            {totals.conversions !== undefined ? (
              <StatTile label="Conversiones" value={totals.conversions} delta={comparison?.deltas.conversions} />
            ) : null}
          </section>

          <section className="mt-3 rounded-[6px] border border-line bg-card p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-fg">
              {trend.series.length > 1 ? 'Visitas y visitantes por día' : 'Visitas por día'}
            </h2>
            <TrendChart data={trend.data} series={trend.series} />
          </section>

          <div className="mt-3">
            <RealtimePanel initial={initialLive} project={project.slug} />
          </div>

          <SiteNavigation pages={breakdowns.path} elements={breakdowns.element ?? []} />

          {/* Where they come from. */}
          <h2 className="mb-2 mt-6 text-[15px] font-semibold text-fg">Procedencia</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <RankBar title="Canales" slices={breakdowns.channel} metricKey="visits" />
            <RankBar title="Fuentes" slices={breakdowns.source} metricKey="visits" />
            <RankBar
              title="Campañas"
              slices={breakdowns.campaign}
              metricKey="visits"
              emptyHint="Ninguna visita llegó con utm_campaign en este periodo."
            />
          </div>
          <div className="mt-3">
            <AcquisitionTable slices={breakdowns.acquisition ?? []} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <RankBar title="Páginas de entrada" slices={breakdowns.landing ?? []} metricKey="visits" limit={10} />
            <RankBar title="Páginas de salida" slices={breakdowns.exit ?? []} metricKey="visits" limit={10} />
          </div>

          {/* Where they are, and when. */}
          <h2 className="mb-2 mt-6 text-[15px] font-semibold text-fg">Ubicación y horario</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <RankBar title="Países" slices={breakdowns.country} metricKey="visits" />
            <RankBar title="Regiones" slices={breakdowns.region ?? []} metricKey="visits" labelOf={labelRegion} emptyHint={V2_HINT} />
            <RankBar title="Ciudades" slices={breakdowns.city ?? []} metricKey="visits" emptyHint={V2_HINT} />
          </div>
          <div className="mt-3">
            <HourlyActivity slices={breakdowns.hour} timezone={project.timezone} />
          </div>

          {/* With what. */}
          <h2 className="mb-2 mt-6 text-[15px] font-semibold text-fg">Dispositivos</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <RankBar title="Tipo de dispositivo" slices={breakdowns.device} metricKey="visits" limit={4} emptyHint={V2_HINT} />
            <RankBar title="Navegadores" slices={breakdowns.browser ?? []} metricKey="visits" emptyHint={V2_HINT} />
            <RankBar title="Sistemas operativos" slices={breakdowns.os ?? []} metricKey="visits" emptyHint={V2_HINT} />
            <RankBar title="Idiomas" slices={breakdowns.language ?? []} metricKey="visits" labelOf={labelLanguage} emptyHint={V2_HINT} />
            <RankBar title="Pantallas" slices={breakdowns.screen ?? []} metricKey="visits" labelOf={labelScreen} emptyHint={V2_HINT} />
          </div>

          <div className="mt-6">
            <EventsTable slices={breakdowns.event ?? []} />
          </div>

          <BusinessKpis totals={totals} comparison={comparison} />
        </>
      )}
    </>
  );
}

/** Why a v2 breakdown can be empty: the site hasn't moved to the new tracker. */
const V2_HINT = 'Llega con el tracker v2 del sitio.';

/** When this project last sent. It goes at the top because it's the first
 *  explanation for an empty chart: the numbers didn't drop, the submissions
 *  stopped arriving. The API does the classification — the browser's clock
 *  may be wrong. */
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
