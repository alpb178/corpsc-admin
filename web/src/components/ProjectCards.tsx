import { ProjectCard } from './ProjectCard';
import { projectCards } from '@/lib/dashboard';
import type { Overview } from '@/lib/types';

interface Props {
  overview: Pick<Overview, 'projects' | 'seriesByProject'>;
  /** The range preset in the URL, or null for the default. */
  range: string | null;
}

/**
 * The group, site by site: the cards are the dashboard's answer to "which
 * site is growing and which one is falling", always on screen, without
 * opening each one. Most visited first; the ones with nothing in the period
 * are named at the foot so nobody wonders where they went.
 */
export function ProjectCards({ overview, range }: Props) {
  const { withData, without } = projectCards(overview);

  return (
    <section aria-label="Por proyecto" className="mt-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Por proyecto</h2>
        <p className="text-[12px] text-fg-faint">
          {withData.length === 1 ? '1 sitio con tráfico' : `${withData.length} sitios con tráfico`} · de más a menos visitas
        </p>
      </div>

      {withData.length === 0 ? (
        <p className="text-[13px] text-fg-faint">Ningún sitio tiene visitas en este periodo.</p>
      ) : (
        <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {withData.map((p) => (
            <ProjectCard key={p.slug} project={p} range={range} />
          ))}
        </div>
      )}

      {without.length > 0 ? (
        <p className="mt-3 text-[12px] text-fg-faint">
          Sin datos en este periodo: {without.map((p) => p.name).join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
