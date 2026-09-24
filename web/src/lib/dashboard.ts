import { assignSlots } from './series-slots';
import type { DimensionSlice, Overview, ProjectSeries, TopPage } from './types';
import type { TrendSeries } from '@/components/charts/TrendChart';

/**
 * The group dashboard's data, shaped for its components. Kept out of the page
 * so it can be tested without rendering a server component.
 */

/** Visits and unique visitors per day, on one axis: same unit, same scale. */
export function visitsAndVisitors(overview: Overview): {
  data: Array<Record<string, string | number | null>>;
  series: TrendSeries[];
} {
  const visitors = new Map(overview.visitors.daily.map((d) => [d.date, d.value]));
  const hasVisitors = overview.visitors.since !== null;

  return {
    data: overview.series.map((point) => ({
      date: point.date,
      visits: point.metrics.visits ?? null,
      ...(hasVisitors ? { visitors: visitors.get(point.date) ?? null } : {}),
    })),
    series: [
      { key: 'visits', label: 'Visitas', slot: 1 },
      ...(hasVisitors ? [{ key: 'visitors', label: 'Visitantes únicos', slot: 2 }] : []),
    ],
  };
}

/**
 * Visits per day, one line per site. The colour follows the site —its place
 * in the catalogue—, never its rank in this period: a site that stops having
 * traffic must not repaint the others.
 */
export function trafficByProject(
  seriesByProject: ProjectSeries[],
  catalogue: string[],
): { data: Array<Record<string, string | number | null>>; series: TrendSeries[] } {
  const slots = assignSlots(
    seriesByProject.map((s) => s.slug),
    catalogue,
  );
  const dates = seriesByProject[0]?.points.map((p) => p.date) ?? [];

  return {
    data: dates.map((date, i) => ({
      date,
      ...Object.fromEntries(seriesByProject.map((s) => [s.slug, s.points[i]?.value ?? null])),
    })),
    series: seriesByProject.map((s) => ({ key: s.slug, label: s.name, slot: slots.get(s.slug) ?? 1 })),
  };
}

/** Top pages as rank-bar slices, each named with its site: `/es` on two sites is two pages. */
export function topPageSlices(pages: TopPage[]): DimensionSlice[] {
  return pages.map((p) => ({ value: `${p.project.name} · ${p.path}`, metrics: { page_views: p.pageViews } }));
}

/**
 * The "since" hint of the unique-visitors tile. Visitors are only identified
 * since the sites send tracker v2; before that day there is nothing to count,
 * and the tile has to say so rather than look like a drop.
 */
export function visitorsHint(since: string | null, from: string): string | undefined {
  if (!since) return 'llega con el tracker v2';
  return since > from ? `desde ${since.slice(8, 10)}/${since.slice(5, 7)}` : undefined;
}
