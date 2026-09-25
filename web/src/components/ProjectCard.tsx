import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { DailyColumns } from './DailyColumns';
import { DeltaPill } from './DeltaPill';
import { SiteMark } from './SiteMark';
import { formatMetric } from '@/lib/format';
import { withRange } from '@/lib/navigation';
import type { ProjectCardData } from '@/lib/dashboard';
import type { Delta } from '@/lib/types';

interface Props {
  project: ProjectCardData;
  /** The range preset in the URL, kept on the way to the site's page. */
  range: string | null;
}

const KIND: Record<ProjectCardData['kind'], string> = { OWN: 'Propio', CLIENT: 'Cliente' };

/**
 * One site, at a glance: its visits in the period, whether they grew or fell
 * against the previous one, the shape of its days, and the figures behind
 * them. The whole card opens the site's page, as the KPI cards of Tu Chamba's
 * admin do.
 *
 * The change is the site's OWN: the API compares each project with its own
 * previous period. Without a comparison —"Hoy" against yesterday is one—
 * the card says so rather than hiding the slot.
 */
export function ProjectCard({ project, range }: Props) {
  const { metrics, deltas } = project;
  const visits = deltas?.visits;

  return (
    <Link
      href={withRange(`/projects/${project.slug}`, range)}
      title={`Ver ${project.name}`}
      className="card card-link group/card block p-5 animate-fade-up motion-reduce:animate-none"
    >
      <div className="flex items-center gap-3">
        <SiteMark name={project.name} logo={project.logo} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-fg">{project.name}</h3>
          <p className="truncate text-[12px] text-fg-faint">{project.domain}</p>
        </div>
        <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          {KIND[project.kind]}
        </span>
        <ChevronRight
          size={18}
          aria-hidden
          className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover/card:opacity-100"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div>
          <p className="text-[12px] font-medium text-fg-muted">Visitas</p>
          <p className="mt-0.5 text-[34px] font-bold leading-none text-accent">
            <AnimatedNumber value={metrics.visits} />
          </p>
        </div>
        {visits ? (
          <DeltaPill delta={visits} />
        ) : (
          <span className="text-[12px] text-fg-faint">sin periodo anterior</span>
        )}
      </div>

      <div className="mt-4">
        <DailyColumns points={project.trend} noun="visitas" height="h-20" />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <MiniStat label="Páginas" value={metrics.page_views} delta={deltas?.page_views} />
        <MiniStat label="Clics" value={metrics.clicks} delta={deltas?.clicks} />
        {metrics.conversions !== undefined ? (
          <MiniStat label="Conversiones" value={metrics.conversions} delta={deltas?.conversions} />
        ) : metrics.orders !== undefined ? (
          <MiniStat label="Pedidos" value={metrics.orders} delta={deltas?.orders} />
        ) : metrics.leads !== undefined ? (
          <MiniStat label="Contactos" value={metrics.leads} delta={deltas?.leads} />
        ) : null}
      </dl>
    </Link>
  );
}

/** A small figure with its own change. A metric the site doesn't send stays a dash, not a zero. */
function MiniStat({ label, value, delta }: { label: string; value: number | undefined; delta?: Delta }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-fg-faint">{label}</dt>
      <dd className="mt-0.5 flex flex-col items-start gap-1">
        <span className="tabular text-[15px] font-semibold text-fg">{formatMetric(value)}</span>
        {delta && value !== undefined ? <DeltaPill delta={delta} compact /> : null}
      </dd>
    </div>
  );
}
