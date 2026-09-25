import { Injectable, NotFoundException } from '@nestjs/common';
import { SiteEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** "Right now" means the last five minutes, as in most analytics tools. */
export const DEFAULT_REALTIME_MINUTES = 5;
export const MAX_REALTIME_MINUTES = 60;
/** How many of the latest events the panel lists. */
export const RECENT_EVENTS = 20;

const TYPE_NAMES: Record<SiteEventType, string> = {
  PAGE_VIEW: 'page_view',
  CLICK: 'click',
  SITE_CLICK: 'site_click',
  CUSTOM: 'custom',
};

export interface RecentEvent {
  /** The raw event's id, as text: BigInt doesn't survive JSON. It lets the panel delete one. */
  id: string;
  at: Date;
  project: { slug: string; name: string };
  type: string;
  path: string;
  country: string | null;
  city: string | null;
  device: string | null;
  /** Where the visit came from: the campaign's source, else the referring domain. Page views only. */
  source: string | null;
  /** On clicks, what was clicked; on custom events, their name. */
  detail: string | null;
}

export interface RealtimeSnapshot {
  minutes: number;
  /** Different sessions with an event in the window. */
  activeVisitors: number;
  /** Per project, for the group view. Only projects with someone active. */
  byProject: Array<{ slug: string; name: string; activeVisitors: number }>;
  recent: RecentEvent[];
  lastEventAt: Date | null;
}

/**
 * What is happening now, read straight from the raw events.
 *
 * It's the one view that doesn't go through `metric_daily`: the rollup runs
 * seconds later and cuts by day, and "who's on the site now" is minutes. A
 * range of minutes over `site_event` is cheap —the `occurred_at` index— and
 * the panel polls it every few seconds instead of keeping a socket open.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(slug?: string, minutes = DEFAULT_REALTIME_MINUTES): Promise<RealtimeSnapshot> {
    const window = Math.min(Math.max(Math.trunc(minutes) || DEFAULT_REALTIME_MINUTES, 1), MAX_REALTIME_MINUTES);
    const since = new Date(Date.now() - window * 60_000);

    let projectId: string | undefined;
    if (slug) {
      const project = await this.prisma.project.findUnique({ where: { slug }, select: { id: true } });
      if (!project) throw new NotFoundException(`No existe el proyecto "${slug}"`);
      projectId = project.id;
    }

    const [active, recent] = await Promise.all([
      this.prisma.siteEvent.groupBy({
        by: ['projectId', 'sessionId'],
        where: { occurredAt: { gte: since }, ...(projectId ? { projectId } : {}) },
      }),
      this.prisma.siteEvent.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { occurredAt: 'desc' },
        take: RECENT_EVENTS,
        select: {
          id: true,
          occurredAt: true,
          type: true,
          path: true,
          country: true,
          city: true,
          device: true,
          referrer: true,
          utmSource: true,
          label: true,
          name: true,
          project: { select: { slug: true, name: true } },
        },
      }),
    ]);

    const perProject = new Map<string, number>();
    for (const row of active) perProject.set(row.projectId, (perProject.get(row.projectId) ?? 0) + 1);

    const projects = perProject.size
      ? await this.prisma.project.findMany({
          where: { id: { in: [...perProject.keys()] } },
          select: { id: true, slug: true, name: true },
        })
      : [];

    return {
      minutes: window,
      activeVisitors: active.length,
      byProject: projects
        .map((p) => ({ slug: p.slug, name: p.name, activeVisitors: perProject.get(p.id) ?? 0 }))
        .sort((a, b) => b.activeVisitors - a.activeVisitors),
      recent: recent.map((e) => ({
        id: String(e.id),
        at: e.occurredAt,
        project: e.project,
        type: TYPE_NAMES[e.type],
        path: e.path,
        country: e.country,
        city: e.city,
        device: e.device,
        source: e.type === SiteEventType.PAGE_VIEW ? (e.utmSource ?? e.referrer) : null,
        detail: e.type === SiteEventType.CUSTOM ? e.name : e.label,
      })),
      lastEventAt: recent[0]?.occurredAt ?? null,
    };
  }
}
