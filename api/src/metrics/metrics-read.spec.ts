import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, ProjectKind, SiteEventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { MetricsService } from './metrics.service';
import { VisitorsService } from './visitors.service';
import { RealtimeService, RECENT_EVENTS } from './realtime.service';
import { FreshnessService } from '../ingestion/freshness.service';
import { addDays, toUtcDate } from '../ingestion/common/dates';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The read side against a real Postgres: what matters —distinct visitors,
 * breakdowns summed over a range, the last minutes of events— lives in SQL.
 *
 * Other spec files write to the same database in parallel, so the group-wide
 * reads use days in 2031, which nothing else touches, and real-time checks
 * look at these projects' own entries rather than at global totals.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const db = prisma as unknown as PrismaService;
const visitors = new VisitorsService(db);
const metrics = new MetricsService(db, new FreshnessService(db), visitors);
const realtime = new RealtimeService(db);

/**
 * The service returns loosely typed views (`Record<string, unknown>`); the
 * tests read into them freely.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type View = Record<string, any>;

const PREFIX = 'test-metrics-read';
let alpha: { id: string; slug: string };
let beta: { id: string; slug: string };

const RANGE = { from: '2031-05-10', to: '2031-05-12' };

async function metric(projectId: string, date: string, metricKey: string, value: number, dimension = 'total', dimValue = '__total__') {
  await prisma.metricDaily.create({
    data: { projectId, date: toUtcDate(date), metricKey, dimension, dimValue, value },
  });
}

async function seen(projectId: string, date: string, ...visitorIds: string[]) {
  await prisma.visitorDaily.createMany({
    data: visitorIds.map((visitorId) => ({ projectId, date: toUtcDate(date), visitorId })),
  });
}

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  const create = (suffix: string, sortOrder: number) =>
    prisma.project.create({
      data: {
        slug: `${PREFIX}-${suffix}`,
        name: `Read ${suffix}`,
        domain: `${PREFIX}-${suffix}.invalid`,
        kind: ProjectKind.OWN,
        sortOrder,
      },
      select: { id: true, slug: true },
    });
  alpha = await create('alpha', 9001);
  beta = await create('beta', 9002);
});

beforeEach(async () => {
  for (const p of [alpha, beta]) {
    await prisma.metricDaily.deleteMany({ where: { projectId: p.id } });
    await prisma.visitorDaily.deleteMany({ where: { projectId: p.id } });
    await prisma.siteEvent.deleteMany({ where: { projectId: p.id } });
  }
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe('VisitorsService', () => {
  it('tells new from returning visitors within a range', async () => {
    await seen(alpha.id, '2031-05-01', 'visitor-old');
    await seen(alpha.id, '2031-05-10', 'visitor-old', 'visitor-new');
    // Seen twice in the range: still one visitor.
    await seen(alpha.id, '2031-05-11', 'visitor-new');

    const stats = await visitors.stats(RANGE, alpha.id);

    expect(stats).toMatchObject({ unique: 2, new: 1, returning: 1, since: '2031-05-01' });
    expect(stats.daily).toEqual([
      { date: '2031-05-10', value: 2 },
      { date: '2031-05-11', value: 1 },
      // A day without identified visitors is a gap, not a zero.
      { date: '2031-05-12', value: null },
    ]);
  });

  it('counts the same id on two sites as two visitors: each site has its own cookie', async () => {
    await seen(alpha.id, '2031-05-10', 'visitor-shared');
    await seen(beta.id, '2031-05-10', 'visitor-shared');

    expect((await visitors.stats(RANGE)).unique).toBe(2);
    expect((await visitors.stats(RANGE, beta.id)).unique).toBe(1);
  });

  it('says there is no history before a site sends v2', async () => {
    expect(await visitors.stats(RANGE, alpha.id)).toMatchObject({ unique: 0, new: 0, returning: 0, since: null });
  });
});

describe('MetricsService.visitors', () => {
  it('reads one site by slug', async () => {
    await seen(alpha.id, '2031-05-10', 'visitor-a');

    expect((await metrics.visitors(RANGE, alpha.slug)).unique).toBe(1);
  });

  it('rejects an unknown site and a reversed range', async () => {
    await expect(metrics.visitors(RANGE, `${PREFIX}-nope`)).rejects.toThrow(NotFoundException);
    await expect(metrics.visitors({ from: '2031-05-12', to: '2031-05-10' })).rejects.toThrow(BadRequestException);
  });
});

describe('MetricsService.overview', () => {
  beforeEach(async () => {
    await metric(alpha.id, '2031-05-10', 'visits', 10);
    await metric(alpha.id, '2031-05-11', 'visits', 5);
    await metric(beta.id, '2031-05-10', 'visits', 3);
    await metric(alpha.id, '2031-05-10', 'visits', 6, 'country', 'BO');
    await metric(alpha.id, '2031-05-10', 'visits', 4, 'country', '__unknown__');
    await metric(beta.id, '2031-05-10', 'visits', 3, 'country', 'PE');
    await metric(alpha.id, '2031-05-10', 'visits', 10, 'source', 'google.com');
    await metric(beta.id, '2031-05-10', 'visits', 3, 'source', '__other__');
    await metric(alpha.id, '2031-05-10', 'page_views', 7, 'path', '/es');
    await metric(beta.id, '2031-05-10', 'page_views', 9, 'path', '/es');
    await metric(alpha.id, '2031-05-10', 'custom_events', 2, 'event', 'contact_submit');
    await seen(alpha.id, '2031-05-10', 'visitor-a', 'visitor-b');
  });

  it('adds the group breakdowns, counts and per-site series', async () => {
    const view = (await metrics.overview(RANGE, false)) as View;

    expect(view.counts).toEqual({ activeProjects: 2, countries: 2, sources: 1 });
    expect(view.breakdowns.country.map((s: { value: string }) => s.value)).toEqual(['BO', '__unknown__', 'PE']);
    expect(view.breakdowns.event).toEqual([{ value: 'contact_submit', metrics: { custom_events: 2 } }]);
    expect(view.visitors.unique).toBe(2);

    const alphaSeries = view.seriesByProject.find((s: { slug: string }) => s.slug === alpha.slug);
    expect(alphaSeries.points).toEqual([
      { date: '2031-05-10', value: 10 },
      { date: '2031-05-11', value: 5 },
      { date: '2031-05-12', value: null },
    ]);
  });

  it('lists top pages with their site: the same path on two sites is two pages', async () => {
    const view = (await metrics.overview(RANGE, false)) as View;

    expect(view.topPages).toEqual([
      { project: { slug: beta.slug, name: 'Read beta' }, path: '/es', pageViews: 9 },
      { project: { slug: alpha.slug, name: 'Read alpha' }, path: '/es', pageViews: 7 },
    ]);
  });

  it('compares unique visitors with the previous period', async () => {
    // The previous period of 10–12 May is 7–9 May.
    await seen(alpha.id, '2031-05-08', 'visitor-a');

    const view = (await metrics.overview(RANGE, true)) as View;

    expect(view.comparison.deltas.unique_visitors).toMatchObject({ current: 2, previous: 1, change: 1, improved: true });
  });
});

describe('MetricsService.project', () => {
  it('returns the v2 breakdowns and the visitors of the site', async () => {
    await metric(alpha.id, '2031-05-10', 'visits', 4);
    await metric(alpha.id, '2031-05-10', 'visits', 3, 'device', 'mobile');
    await metric(alpha.id, '2031-05-10', 'visits', 4, 'acquisition', 'Organic Search | google.com | /es');
    await metric(alpha.id, '2031-05-10', 'custom_events', 5, 'event', 'contact_submit');
    await metric(alpha.id, '2031-05-10', 'conversions', 5, 'event', 'contact_submit');
    await seen(alpha.id, '2031-05-10', 'visitor-a');

    const view = (await metrics.project(alpha.slug, RANGE, true)) as View;

    expect(Object.keys(view.breakdowns).sort()).toEqual(
      [
        'acquisition', 'browser', 'campaign', 'channel', 'city', 'country', 'device', 'element', 'event',
        'exit', 'hour', 'landing', 'language', 'os', 'path', 'region', 'screen', 'source',
      ].sort(),
    );
    expect(view.breakdowns.device).toEqual([{ value: 'mobile', metrics: { visits: 3 } }]);
    expect(view.breakdowns.event).toEqual([
      { value: 'contact_submit', metrics: { custom_events: 5, conversions: 5 } },
    ]);
    expect(view.breakdowns.acquisition[0].value).toBe('Organic Search | google.com | /es');
    expect(view.visitors).toMatchObject({ unique: 1, new: 1 });
    expect(view.comparison.deltas.unique_visitors).toMatchObject({ current: 1, previous: 0, change: null });
  });

  it('rejects an unknown site', async () => {
    await expect(metrics.project(`${PREFIX}-nope`, RANGE, false)).rejects.toThrow(NotFoundException);
  });
});

describe('RealtimeService', () => {
  async function event(projectId: string, sessionId: string, minutesAgo: number, extra: Record<string, unknown> = {}) {
    await prisma.siteEvent.create({
      data: {
        projectId,
        type: SiteEventType.PAGE_VIEW,
        sessionId,
        path: '/es',
        occurredAt: new Date(Date.now() - minutesAgo * 60_000),
        ...extra,
      },
    });
  }

  it('counts the sessions active in the window, per site', async () => {
    await event(alpha.id, 'session-rt-a1', 1);
    await event(alpha.id, 'session-rt-a1', 2);
    await event(alpha.id, 'session-rt-a2', 3);
    // Outside the five minutes.
    await event(alpha.id, 'session-rt-a3', 20);
    await event(beta.id, 'session-rt-b1', 1);

    const one = await realtime.snapshot(alpha.slug);
    expect(one.minutes).toBe(5);
    expect(one.activeVisitors).toBe(2);
    expect(one.byProject).toEqual([{ slug: alpha.slug, name: 'Read alpha', activeVisitors: 2 }]);

    const group = await realtime.snapshot();
    expect(group.byProject).toEqual(
      expect.arrayContaining([
        { slug: alpha.slug, name: 'Read alpha', activeVisitors: 2 },
        { slug: beta.slug, name: 'Read beta', activeVisitors: 1 },
      ]),
    );
  });

  it('widens the window when asked, within bounds', async () => {
    await event(alpha.id, 'session-rt-a3', 20);

    expect((await realtime.snapshot(alpha.slug, 30)).activeVisitors).toBe(1);
    expect((await realtime.snapshot(alpha.slug, 500)).minutes).toBe(60);
    expect((await realtime.snapshot(alpha.slug, 0)).minutes).toBe(5);
  });

  it('lists the latest events with their site, origin and detail', async () => {
    await event(alpha.id, 'session-rt-a1', 3, { referrer: 'google.com', country: 'BO', city: 'La Paz', device: 'mobile' });
    await event(alpha.id, 'session-rt-a1', 2, {
      type: SiteEventType.CLICK, section: 'hero', label: 'Contacto', referrer: 'ignored.com',
    });
    await event(alpha.id, 'session-rt-a1', 1, { type: SiteEventType.CUSTOM, name: 'contact_submit' });

    const snap = await realtime.snapshot(alpha.slug);

    expect(snap.recent.map((e) => [e.type, e.source, e.detail])).toEqual([
      ['custom', null, 'contact_submit'],
      ['click', null, 'Contacto'],
      ['page_view', 'google.com', null],
    ]);
    expect(snap.recent[2]).toMatchObject({ project: { slug: alpha.slug, name: 'Read alpha' }, country: 'BO', city: 'La Paz', device: 'mobile' });
    expect(snap.lastEventAt).toEqual(snap.recent[0].at);
  });

  it('caps the list of latest events', async () => {
    for (let i = 0; i < RECENT_EVENTS + 5; i++) await event(alpha.id, `session-rt-${i}`, 1 + i / 100);

    expect((await realtime.snapshot(alpha.slug)).recent).toHaveLength(RECENT_EVENTS);
  });

  it('is empty for a quiet site and rejects an unknown one', async () => {
    expect(await realtime.snapshot(beta.slug)).toMatchObject({ activeVisitors: 0, byProject: [], recent: [], lastEventAt: null });
    await expect(realtime.snapshot(`${PREFIX}-nope`)).rejects.toThrow(NotFoundException);
  });
});

describe('dates used by these tests', () => {
  it('keep the previous period inside 2031', () => {
    expect(addDays(RANGE.from, -3)).toBe('2031-05-07');
  });
});
