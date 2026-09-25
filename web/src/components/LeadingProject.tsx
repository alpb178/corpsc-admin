import Link from 'next/link';
import { ArrowRight, Trophy } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { DailyColumns } from './DailyColumns';
import { DeltaPill } from './DeltaPill';
import { SiteMark } from './SiteMark';
import { formatMetric, formatShare } from '@/lib/format';
import { withRange } from '@/lib/navigation';
import type { ProjectCardData } from '@/lib/dashboard';

interface Props {
  project: ProjectCardData;
  /** The group's visits in the period, for the leader's share of them. */
  groupVisits: number;
  range: string | null;
}

/**
 * The first thing the dashboard shows: the site with the most visits in the
 * period, how it moved, and how much of the group it is. Its card is still
 * in the grid below, among the others, for comparing; this is the headline.
 */
export function LeadingProject({ project, groupVisits, range }: Props) {
  const visits = project.metrics.visits ?? 0;
  const delta = project.deltas?.visits;

  return (
    <section aria-label="Proyecto con más visitas" className="card animate-fade-up p-5 motion-reduce:animate-none">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            <Trophy size={13} aria-hidden />
            Proyecto con más visitas
          </p>

          <div className="mt-3 flex items-center gap-3">
            <SiteMark name={project.name} logo={project.logo} size={48} />
            <div className="min-w-0">
              <h2 className="truncate text-[18px] font-semibold text-fg">{project.name}</h2>
              <p className="truncate text-[12px] text-fg-faint">{project.domain}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <p className="text-[12px] font-medium text-fg-muted">Visitas</p>
              <p className="mt-0.5 text-[40px] font-bold leading-none text-accent">
                <AnimatedNumber value={visits} />
              </p>
            </div>
            {delta ? <DeltaPill delta={delta} /> : null}
          </div>

          <p className="mt-3 text-[12px] text-fg-muted">
            <strong className="tabular font-semibold text-fg">{formatShare(groupVisits ? visits / groupVisits : 0)}</strong> de las
            visitas del grupo
            {project.metrics.page_views !== undefined ? (
              <>
                {' '}· <span className="tabular">{formatMetric(project.metrics.page_views)}</span> páginas vistas
              </>
            ) : null}
          </p>

          <Link
            href={withRange(`/projects/${project.slug}`, range)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
          >
            Ver {project.name}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[12px] font-medium text-fg-muted">Visitas por día</p>
          <DailyColumns points={project.trend} noun="visitas" height="h-36" />
        </div>
      </div>
    </section>
  );
}
