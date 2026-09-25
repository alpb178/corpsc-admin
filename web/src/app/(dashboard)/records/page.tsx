import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/dal';
import { presetFrom, resolveRange } from '@/lib/ranges';
import { logoOf, withRange } from '@/lib/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ErrorPanel, EmptyState } from '@/components/ErrorPanel';
import { SiteMark } from '@/components/SiteMark';
import { AcquisitionTable } from '@/components/AcquisitionTable';
import { PathTable } from '@/components/PathTable';
import { SiteNavigation } from '@/components/SiteNavigation';
import { RecentEventsTable } from '@/components/RecentEventsTable';
import { WipeProjectForm } from './WipeProjectForm';
import { deleteRow } from './actions';
import type { AdminProject, ProjectDetail, RealtimeSnapshot } from '@/lib/types';

/**
 * Everything the hub keeps of one site, table by table, for whoever may
 * delete it: a row at a time within the period on screen, or all of it.
 * Admins and analysts only; the role is checked here and in every action.
 */
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; range?: string; rango?: string }>;
}) {
  await requireRole('ADMIN', 'ANALYST');
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = resolveRange(preset);

  let projects: AdminProject[];
  try {
    projects = await api<AdminProject[]>('/projects');
  } catch (error) {
    return <ErrorPanel title="No se pudieron cargar los proyectos" message={error instanceof ApiError ? error.message : 'Error inesperado.'} />;
  }

  const project = projects.find((p) => p.slug === params.project) ?? projects[0];
  if (!project) return <EmptyState message="No hay proyectos en el hub." />;

  let detail: ProjectDetail;
  try {
    detail = await api<ProjectDetail>(`/metrics/projects/${project.slug}`, range);
  } catch (error) {
    return <ErrorPanel title={`No se pudieron cargar los registros de ${project.name}`} message={error instanceof ApiError ? error.message : 'Error inesperado.'} />;
  }
  const live = await api<RealtimeSnapshot>('/metrics/realtime', { project: project.slug }).catch(() => null);

  const rangeParam = params.range ?? params.rango ? preset : null;
  const deletion = { action: deleteRow, slug: project.slug, from: range.from, to: range.to };
  const { breakdowns } = detail;

  return (
    <>
      <PageHeader title="Registros" subtitle={project.name} range={range} preset={preset} />

      <nav aria-label="Proyecto" className="mb-4 flex flex-wrap gap-1.5">
        {projects.map((p) => {
          const active = p.slug === project.slug;
          return (
            <Link
              key={p.slug}
              href={withRange(`/records?project=${encodeURIComponent(p.slug)}`, rangeParam).replace('?range=', '&range=')}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12px] font-medium transition-colors ${
                active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-fg-muted hover:border-line-strong hover:text-fg'
              }`}
            >
              <SiteMark name={p.name} logo={logoOf(p.slug)} size={22} />
              {p.name}
            </Link>
          );
        })}
      </nav>

      <p className="mb-4 max-w-[80ch] text-[13px] text-fg-muted">
        Lo que el hub guarda de {project.name} en el periodo elegido. Borrar una fila quita sus eventos de esos días y
        recalcula el resto. Los días cuyos eventos ya se depuraron (más de 90 días) solo pierden esa fila: sus totales no
        cambian.
      </p>

      <AcquisitionTable slices={breakdowns.acquisition ?? []} deletion={deletion} />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <PathTable
          title="Páginas de entrada"
          subtitle="Primera página de cada visita."
          slices={breakdowns.landing ?? []}
          emptyText="Sin datos en este periodo."
          table="landing"
          deletion={deletion}
        />
        <PathTable
          title="Páginas de salida"
          subtitle="Última página de cada visita."
          slices={breakdowns.exit ?? []}
          emptyText="Sin datos en este periodo."
          table="exit"
          deletion={deletion}
        />
      </div>

      <SiteNavigation pages={breakdowns.path} elements={breakdowns.element ?? []} deletion={deletion} />

      <div className="mt-3">
        <RecentEventsTable events={live?.recent ?? []} showProject={false} deletion={deletion} />
      </div>

      <div className="mt-6">
        <WipeProjectForm slug={project.slug} name={project.name} />
      </div>
    </>
  );
}
