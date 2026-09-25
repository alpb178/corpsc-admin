import { assignSlots } from './series-slots';
import { logoOf } from './navigation';
import type { Delta, DimensionSlice, Overview, ProjectSeries, ProjectSummary, SeriesPoint, TopPage } from './types';
import type { TrendSeries } from '@/components/charts/TrendChart';

/**
 * The group dashboard's data, shaped for its components. Kept out of the page
 * so it can be tested without rendering a server component.
 */

/** Visits and unique visitors per day, on one axis: same unit, same scale. */
export function visitsAndVisitors(overview: Pick<Overview, 'series' | 'visitors'>): {
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

export interface Acquisition {
  /** The row as the hub stores it: what a deletion names. */
  key: string;
  channel: string;
  source: string;
  landing: string;
  visits: number;
}

/**
 * "Organic Search | google.com | /es/servicios" back into its parts: how the
 * visit arrived, from where, and on which page. `__other__` —the rest of the
 * top-N— isn't a route and is left out.
 */
export function acquisitionRows(slices: DimensionSlice[]): Acquisition[] {
  return slices
    .filter((s) => s.value !== '__other__')
    .map((s) => {
      const [channel = '', source = '', ...landing] = s.value.split(' | ');
      return { key: s.value, channel, source, landing: landing.join(' | '), visits: s.metrics.visits ?? 0 };
    })
    .filter((row) => row.visits > 0 && row.landing !== '');
}

/** One column of a daily chart. `to` is set when several days were summed into it. */
export interface DayValue {
  date: string;
  to?: string;
  value: number | null;
}

/** One metric's daily values out of a series, with gaps kept as gaps. */
export function metricTrend(series: SeriesPoint[], key: string): DayValue[] {
  return series.map((p) => ({ date: p.date, value: p.metrics[key] ?? null }));
}

/**
 * At most `max` columns. Beyond that a bar is thinner than a pixel and the
 * chart reads as noise, so consecutive days are summed into one column.
 *
 * Only for additive metrics: summing visits over a week is a week's visits,
 * but summing a rate is nonsense. The dashboard never draws a rate this way.
 * A column is a gap only when every one of its days was a gap.
 */
export function bucketed(points: DayValue[], max = 31): DayValue[] {
  if (points.length <= max) return points;
  const size = Math.ceil(points.length / max);
  const out: DayValue[] = [];

  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    const values = chunk.map((p) => p.value).filter((v): v is number => v !== null);
    out.push({
      date: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      value: values.length ? values.reduce((a, b) => a + b, 0) : null,
    });
  }

  return out;
}

export interface ProjectCardData {
  slug: string;
  name: string;
  kind: 'OWN' | 'CLIENT';
  domain: string;
  logo?: string;
  metrics: ProjectSummary['metrics'];
  /** Only when the overview was asked with a comparison. */
  deltas?: Record<string, Delta>;
  /** Visits per day in the period. */
  trend: DayValue[];
}

/**
 * One card per site with traffic, most visited first, each with its own days
 * and its own change. The sites with nothing in the period are listed apart:
 * a card with a zero and a flat line would look like a site in trouble when it
 * may just be a client page nobody opened this week.
 */
export function projectCards(
  overview: Pick<Overview, 'projects' | 'seriesByProject'>,
): { withData: ProjectCardData[]; without: ProjectSummary[] } {
  const series = new Map(overview.seriesByProject.map((s) => [s.slug, s.points]));
  const withData = overview.projects
    .filter((p) => (p.metrics.visits ?? 0) > 0)
    .sort((a, b) => (b.metrics.visits ?? 0) - (a.metrics.visits ?? 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      domain: p.domain,
      logo: logoOf(p.slug),
      metrics: p.metrics,
      deltas: p.comparison?.deltas,
      trend: series.get(p.slug) ?? [],
    }));
  const without = overview.projects.filter((p) => !((p.metrics.visits ?? 0) > 0));

  return { withData, without };
}
