import 'dotenv/config';
import { PrismaClient, ProjectKind, SiteEventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  EventRollupService,
  LIVE_DAYS,
  VISITOR_RETENTION_DAYS,
  acquisitionKey,
  cityValue,
  elementKey,
  regionValue,
} from './event-rollup.service';
import { FactWriterService } from './fact-writer.service';
import { addDays, todayIn, toUtcDate } from './common/dates';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Tests against a real Postgres: what's being tested —cutting the day in the
 * project's zone and counting distinct sessions— lives in SQL, so with a mock
 * nothing would actually be tested.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const service = new EventRollupService(
  prisma as unknown as PrismaService,
  new FactWriterService(prisma as unknown as PrismaService),
);

const SLUG = 'test-event-rollup';
/** La Paz is UTC−4: an event at 01:00 UTC still belongs to the previous day. */
const TZ = 'America/La_Paz';
const FROM = '2026-03-01';
const TO = '2026-03-02';

let project: { id: string; slug: string; timezone: string };

interface EventSeed {
  type: SiteEventType;
  sessionId: string;
  at: string;
  path?: string;
  target?: string;
  linkType?: string;
  section?: string;
  label?: string;
  country?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  visitorId?: string;
  name?: string;
  region?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  language?: string;
  screen?: string;
}

async function seedEvents(events: EventSeed[]): Promise<void> {
  await prisma.siteEvent.createMany({
    data: events.map((e) => ({
      projectId: project.id,
      type: e.type,
      sessionId: e.sessionId,
      path: e.path ?? '/es',
      target: e.target ?? null,
      linkType: e.linkType ?? null,
      section: e.section ?? null,
      label: e.label ?? null,
      country: e.country ?? null,
      referrer: e.referrer ?? null,
      utmSource: e.utmSource ?? null,
      utmMedium: e.utmMedium ?? null,
      utmCampaign: e.utmCampaign ?? null,
      visitorId: e.visitorId ?? null,
      name: e.name ?? null,
      region: e.region ?? null,
      city: e.city ?? null,
      device: e.device ?? null,
      browser: e.browser ?? null,
      os: e.os ?? null,
      language: e.language ?? null,
      screen: e.screen ?? null,
      occurredAt: new Date(e.at),
    })),
  });
}

function stored() {
  return prisma.metricDaily.findMany({
    where: { projectId: project.id },
    orderBy: [{ date: 'asc' }, { metricKey: 'asc' }, { dimValue: 'asc' }],
    select: { date: true, metricKey: true, dimension: true, dimValue: true, value: true },
  });
}

/** `dimension` disambiguates values several breakdowns share, like `__unknown__`. */
async function valueOf(metricKey: string, dimValue = '__total__', dimension?: string): Promise<number | null> {
  const row = (await stored()).find(
    (r) => r.metricKey === metricKey && r.dimValue === dimValue && (!dimension || r.dimension === dimension),
  );
  return row ? Number(row.value) : null;
}

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  project = await prisma.project.create({
    data: { slug: SLUG, name: 'Test events', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN, timezone: TZ },
    select: { id: true, slug: true, timezone: true },
  });
});

beforeEach(async () => {
  await prisma.siteEvent.deleteMany({ where: { projectId: project.id } });
  await prisma.metricDaily.deleteMany({ where: { projectId: project.id } });
  await prisma.ingestionRun.deleteMany({ where: { projectId: project.id } });
  await prisma.visitorDaily.deleteMany({ where: { projectId: project.id } });
  await prisma.conversionGoal.deleteMany({ where: { projectId: project.id } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('event rollup', () => {
  it('counts one visit per session, not per page view', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:02:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:05:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-two-bbb', at: '2026-03-01T18:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits')).toBe(2);
    expect(await valueOf('page_views')).toBe(4);
  });

  it('cuts the day in the project timezone, not in UTC', async () => {
    await seedEvents([
      // 01:00 UTC on the 2nd is 21:00 on the 1st in La Paz.
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-late-aa', at: '2026-03-02T01:00:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-morn-bb', at: '2026-03-02T14:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    // Only the aggregate row: the path breakdown carries the same figures again.
    const rows = (await stored()).filter(
      (r) => r.metricKey === 'page_views' && r.dimension === 'total',
    );
    expect(rows.map((r) => [r.date.toISOString().slice(0, 10), Number(r.value)])).toEqual([
      ['2026-03-01', 1],
      ['2026-03-02', 1],
    ]);
  });

  it('breaks down clicks by target project and by link type', async () => {
    await seedEvents([
      { type: SiteEventType.SITE_CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', target: 'take', linkType: 'web' },
      { type: SiteEventType.SITE_CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:01:00Z', target: 'take', linkType: 'web' },
      { type: SiteEventType.SITE_CLICK, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z', target: 'iris-natural', linkType: 'android' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('site_clicks')).toBe(3);
    expect(await valueOf('site_clicks', 'take')).toBe(2);
    expect(await valueOf('site_clicks', 'iris-natural')).toBe(1);
    expect(await valueOf('site_clicks', 'android')).toBe(1);
    expect(await valueOf('site_clicks', 'web')).toBe(2);
  });

  it('re-rolling the same window neither duplicates nor leaves traces of the previous one', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO);

    // A late event arrives and the same day is rolled up again.
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('page_views')).toBe(2);
    expect((await stored()).filter((r) => r.metricKey === 'page_views' && r.dimension === 'total')).toHaveLength(1);
  });

  it('does not touch metrics it does not own', async () => {
    // A project that also pushes its orders: the rollup only owns visits,
    // pages and clicks.
    await prisma.metricDaily.create({
      data: {
        projectId: project.id,
        date: toUtcDate(FROM),
        metricKey: 'orders',
        dimension: 'total',
        dimValue: '__total__',
        value: 7,
      },
    });
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('orders')).toBe(7);
  });

  it('writes nothing without events: silence is not a zero', async () => {
    const result = await service.rollupWindow(project, FROM, TO);

    expect(result).toBeNull();
    expect(await stored()).toHaveLength(0);
    expect(await prisma.ingestionRun.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe('in-page clicks', () => {
  it('counts clicks by page and by element, including outbound ones', async () => {
    await seedEvents([
      { type: SiteEventType.CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', path: '/es', section: 'hero', label: 'Ver proyectos' },
      { type: SiteEventType.CLICK, sessionId: 'session-two-bbb', at: '2026-03-01T15:10:00Z', path: '/es', section: 'hero', label: 'Ver proyectos' },
      { type: SiteEventType.CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:20:00Z', path: '/es/contacto', section: 'footer', label: 'Email' },
      { type: SiteEventType.SITE_CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:30:00Z', path: '/es', section: 'projects', label: 'Take', target: 'take', linkType: 'web' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('clicks')).toBe(4);
    expect(await valueOf('site_clicks')).toBe(1);
    expect(await valueOf('clicks', '/es')).toBe(3);
    expect(await valueOf('clicks', '/es | hero | Ver proyectos')).toBe(2);
    expect(await valueOf('clicks', '/es | projects | Take')).toBe(1);
    expect(await valueOf('clicks', '/es/contacto | footer | Email')).toBe(1);
  });

  it('a site click without a section counts in the total but not in the breakdown', async () => {
    await seedEvents([
      { type: SiteEventType.SITE_CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', target: 'take', linkType: 'web' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('clicks')).toBe(1);
    const elements = (await stored()).filter((r) => r.dimension === 'element');
    expect(elements).toHaveLength(0);
  });

  it('strips the pipe from the parts so the value can be split back', () => {
    expect(elementKey('/es', 'nav | top', 'A|B')).toBe('/es | nav / top | A/B');
  });
});

describe('where and when visits come from', () => {
  const PV = SiteEventType.PAGE_VIEW;

  it('takes country, source and hour from the first event of each visit', async () => {
    await seedEvents([
      // 14:00 UTC is 10:00 in La Paz.
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T14:00:00Z', country: 'BO', referrer: 'google.com' },
      // The second page of the same visit carries no origin: it doesn't count again.
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T14:05:00Z', country: 'BO' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T22:30:00Z', country: 'AR',
        utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'autumn' },
      { type: PV, sessionId: 'session-three-c', at: '2026-03-01T22:40:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits')).toBe(3);
    expect(await valueOf('visits', 'BO')).toBe(1);
    expect(await valueOf('visits', 'AR')).toBe(1);
    expect(await valueOf('visits', '__unknown__', 'country')).toBe(1);
    expect(await valueOf('visits', 'Organic Search')).toBe(1);
    expect(await valueOf('visits', 'Organic Social')).toBe(1);
    expect(await valueOf('visits', 'Direct')).toBe(1);
    expect(await valueOf('visits', 'google.com')).toBe(1);
    expect(await valueOf('visits', 'instagram')).toBe(1);
    expect(await valueOf('visits', '__direct__')).toBe(1);
    expect(await valueOf('visits', 'autumn')).toBe(1);
    expect(await valueOf('visits', '10')).toBe(1);
    expect(await valueOf('visits', '18')).toBe(2);
    expect(await valueOf('page_views', '10')).toBe(2);
  });

  it('every visits breakdown adds up to the total', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T14:00:00Z', country: 'BO', referrer: 'google.com' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T15:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    const rows = await stored();
    const sum = (dimension: string) =>
      rows
        .filter((r) => r.metricKey === 'visits' && r.dimension === dimension)
        .reduce((acc, r) => acc + Number(r.value), 0);
    for (const dimension of ['country', 'channel', 'source', 'hour']) {
      expect(sum(dimension), dimension).toBe(2);
    }
  });
});

describe('live rollup', () => {
  const runs = () => prisma.ingestionRun.findMany({ where: { projectId: project.id } });

  it('reuses the run for its window instead of leaving one per visit', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO, { live: true });

    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO, { live: true });

    expect(await runs()).toHaveLength(1);
    expect(await valueOf('visits')).toBe(2);
  });

  it('the nightly one still leaves its own run', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO, { live: true });
    await service.rollupWindow(project, FROM, TO);

    expect(await runs()).toHaveLength(2);
  });

  it('groups a burst of submissions into a single rollup', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(service, 'rollupWindow').mockResolvedValue(null);
    try {
      service.scheduleLive(project);
      service.scheduleLive(project);
      service.scheduleLive(project);
      expect(spy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('anything arriving during a rollup schedules another one afterwards', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const spy = vi
      .spyOn(service, 'rollupWindow')
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(null))))
      .mockResolvedValue(null);
    try {
      service.scheduleLive(project);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // An event arrives while the first one is still running.
      service.scheduleLive(project);
      release();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('contract v2 breakdowns', () => {
  const PV = SiteEventType.PAGE_VIEW;

  /** Sum of a breakdown of `visits`, to check it rebuilds the total. */
  async function visitsBy(dimension: string): Promise<number> {
    return (await stored())
      .filter((r) => r.metricKey === 'visits' && r.dimension === dimension)
      .reduce((acc, r) => acc + Number(r.value), 0);
  }

  it('breaks visits down by device, browser, os, language and screen, from their first event', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z',
        device: 'mobile', browser: 'Chrome', os: 'Android', language: 'es', screen: 'sm' },
      // A later event of the same visit doesn't count it twice.
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:05:00Z', device: 'desktop' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z',
        device: 'desktop', browser: 'Safari', os: 'macOS', language: 'pt', screen: 'xl' },
      // A v1 beacon carries none of it.
      { type: PV, sessionId: 'session-three-c', at: '2026-03-01T17:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits', 'mobile', 'device')).toBe(1);
    expect(await valueOf('visits', 'desktop', 'device')).toBe(1);
    expect(await valueOf('visits', '__unknown__', 'device')).toBe(1);
    expect(await valueOf('visits', 'Chrome', 'browser')).toBe(1);
    expect(await valueOf('visits', 'macOS', 'os')).toBe(1);
    expect(await valueOf('visits', 'pt', 'language')).toBe(1);
    expect(await valueOf('visits', 'sm', 'screen')).toBe(1);
  });

  it('writes region and city together with their country', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', country: 'BO', region: 'L', city: 'La Paz' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z', country: 'PE', region: 'LIM', city: 'Lima' },
      { type: PV, sessionId: 'session-three-c', at: '2026-03-01T17:00:00Z', country: 'BO' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits', 'BO-L', 'region')).toBe(1);
    expect(await valueOf('visits', 'PE-LIM', 'region')).toBe(1);
    expect(await valueOf('visits', 'La Paz, BO', 'city')).toBe(1);
    expect(await valueOf('visits', '__unknown__', 'city')).toBe(1);
  });

  it('takes landing and exit from the first and last page view, and ties source to landing', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', path: '/es/servicios', referrer: 'google.com' },
      { type: SiteEventType.CLICK, sessionId: 'session-one-aaa', at: '2026-03-01T15:01:00Z',
        path: '/es/servicios', section: 'hero', label: 'Contacto' },
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:02:00Z', path: '/es/contacto' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z', path: '/es', utmSource: 'facebook', utmMedium: 'social' },
      // A visit of which only a late click arrived that day: no landing, no exit.
      { type: SiteEventType.CLICK, sessionId: 'session-three-c', at: '2026-03-01T17:00:00Z',
        path: '/es', section: 'footer', label: 'Email' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits', '/es/servicios', 'landing')).toBe(1);
    expect(await valueOf('visits', '/es/contacto', 'exit')).toBe(1);
    expect(await valueOf('visits', '__unknown__', 'landing')).toBe(1);
    expect(await valueOf('visits', 'Organic Search | google.com | /es/servicios', 'acquisition')).toBe(1);
    expect(await valueOf('visits', 'Organic Social | facebook | /es', 'acquisition')).toBe(1);
    expect(await valueOf('visits', 'Direct | __direct__ | __unknown__', 'acquisition')).toBe(1);
  });

  it('every new visits breakdown adds up to the total', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', country: 'BO', region: 'L', device: 'mobile' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z' },
      { type: SiteEventType.CLICK, sessionId: 'session-three-c', at: '2026-03-01T17:00:00Z',
        section: 'footer', label: 'Email' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits')).toBe(3);
    for (const dimension of ['region', 'city', 'device', 'browser', 'os', 'language', 'screen', 'landing', 'exit', 'acquisition']) {
      expect(await visitsBy(dimension), dimension).toBe(3);
    }
  });
});

describe('custom events and conversions', () => {
  const CUSTOM = SiteEventType.CUSTOM;

  it('counts custom events by name', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' },
      { type: CUSTOM, sessionId: 'session-one-aaa', at: '2026-03-01T15:01:00Z', name: 'contact_submit' },
      { type: CUSTOM, sessionId: 'session-one-aaa', at: '2026-03-01T15:02:00Z', name: 'contact_submit' },
      { type: CUSTOM, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z', name: 'whatsapp_click' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('custom_events')).toBe(3);
    expect(await valueOf('custom_events', 'contact_submit', 'event')).toBe(2);
    expect(await valueOf('custom_events', 'whatsapp_click', 'event')).toBe(1);
    // A custom event is neither a page view nor a click.
    expect(await valueOf('page_views')).toBe(1);
    expect(await valueOf('clicks')).toBe(0);
  });

  it('counts as conversions only the events marked as goals', async () => {
    await prisma.conversionGoal.create({
      data: { projectId: project.id, eventName: 'contact_submit', label: 'Formulario de contacto' },
    });
    await prisma.conversionGoal.create({
      data: { projectId: project.id, eventName: 'newsletter', label: 'Boletín', active: false },
    });
    await seedEvents([
      { type: CUSTOM, sessionId: 'session-one-aaa', at: '2026-03-01T15:01:00Z', name: 'contact_submit' },
      { type: CUSTOM, sessionId: 'session-one-aaa', at: '2026-03-01T15:02:00Z', name: 'whatsapp_click' },
      { type: CUSTOM, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z', name: 'newsletter' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('conversions')).toBe(1);
    expect(await valueOf('conversions', 'contact_submit', 'event')).toBe(1);
    expect(await valueOf('conversions', 'newsletter', 'event')).toBeNull();
  });

  it('writes a zero for a day without conversions once the project has goals', async () => {
    await prisma.conversionGoal.create({
      data: { projectId: project.id, eventName: 'contact_submit', label: 'Formulario de contacto' },
    });
    await seedEvents([{ type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' }]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('conversions')).toBe(0);
  });

  it("writes neither metric for a site that doesn't measure them", async () => {
    await seedEvents([{ type: SiteEventType.PAGE_VIEW, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' }]);

    await service.rollupWindow(project, FROM, TO);

    const keys = new Set((await stored()).map((r) => r.metricKey));
    expect(keys.has('custom_events')).toBe(false);
    expect(keys.has('conversions')).toBe(false);
  });
});

describe('visitors', () => {
  const PV = SiteEventType.PAGE_VIEW;
  const visitorDays = () =>
    prisma.visitorDaily.findMany({
      where: { projectId: project.id },
      orderBy: [{ date: 'asc' }, { visitorId: 'asc' }],
      select: { date: true, visitorId: true },
    });

  it('keeps one row per visitor and day, in the project timezone', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', visitorId: 'visitor-aaaa' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T20:00:00Z', visitorId: 'visitor-aaaa' },
      // 01:00 UTC on the 2nd is still the 1st in La Paz.
      { type: PV, sessionId: 'session-three-c', at: '2026-03-02T01:00:00Z', visitorId: 'visitor-bbbb' },
      { type: PV, sessionId: 'session-four-dd', at: '2026-03-02T15:00:00Z', visitorId: 'visitor-aaaa' },
    ]);

    await service.rollupWindow(project, FROM, TO);
    await service.rollupWindow(project, FROM, TO);

    expect((await visitorDays()).map((v) => [v.date.toISOString().slice(0, 10), v.visitorId])).toEqual([
      ['2026-03-01', 'visitor-aaaa'],
      ['2026-03-01', 'visitor-bbbb'],
      ['2026-03-02', 'visitor-aaaa'],
    ]);
  });

  it('counts a visitor as new only on the first day it is seen', async () => {
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', visitorId: 'visitor-aaaa' },
      { type: PV, sessionId: 'session-two-bbb', at: '2026-03-01T16:00:00Z', visitorId: 'visitor-bbbb' },
      { type: PV, sessionId: 'session-three-c', at: '2026-03-02T15:00:00Z', visitorId: 'visitor-aaaa' },
      { type: PV, sessionId: 'session-four-dd', at: '2026-03-02T16:00:00Z', visitorId: 'visitor-cccc' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    const newVisitors = (await stored())
      .filter((r) => r.metricKey === 'new_visitors')
      .map((r) => [r.date.toISOString().slice(0, 10), Number(r.value)]);
    expect(newVisitors).toEqual([
      ['2026-03-01', 2],
      ['2026-03-02', 1],
    ]);
  });

  it('remembers visitors from days whose raw events are gone', async () => {
    // Seen weeks ago; those events were pruned, only the visitor-day remains.
    await prisma.visitorDaily.create({
      data: { projectId: project.id, date: toUtcDate('2026-02-01'), visitorId: 'visitor-aaaa' },
    });
    await seedEvents([
      { type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z', visitorId: 'visitor-aaaa' },
    ]);

    await service.rollupWindow(project, '2026-02-01', TO);

    const newVisitors = (await stored()).filter((r) => r.metricKey === 'new_visitors');
    // Returning on the 1st; and the 1st of February, without raw events, isn't rewritten.
    expect(newVisitors.map((r) => [r.date.toISOString().slice(0, 10), Number(r.value)])).toEqual([['2026-03-01', 0]]);
    expect(await visitorDays()).toHaveLength(2);
  });

  it('writes no new visitors for a day of v1 beacons: unknown is not zero', async () => {
    await seedEvents([{ type: PV, sessionId: 'session-one-aaa', at: '2026-03-01T15:00:00Z' }]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('new_visitors')).toBeNull();
    expect(await visitorDays()).toHaveLength(0);
  });

  it('prunes visitor-days only past their own, longer retention', async () => {
    const today = todayIn('UTC');
    await prisma.visitorDaily.createMany({
      data: [
        { projectId: project.id, date: toUtcDate(addDays(today, -(VISITOR_RETENTION_DAYS + 5))), visitorId: 'visitor-old' },
        { projectId: project.id, date: toUtcDate(addDays(today, -200)), visitorId: 'visitor-kept' },
      ],
    });

    await service.prune();

    expect((await visitorDays()).map((v) => v.visitorId)).toEqual(['visitor-kept']);
  });
});

describe('dimension values', () => {
  it('writes a region as ISO 3166-2 when the country is known', () => {
    expect(regionValue('BO', 'L')).toBe('BO-L');
    expect(regionValue(null, 'L')).toBe('L');
    expect(regionValue('BO', null)).toBe('__unknown__');
  });

  it('writes a city with its country', () => {
    expect(cityValue('AR', 'Córdoba')).toBe('Córdoba, AR');
    expect(cityValue(null, 'Córdoba')).toBe('Córdoba');
    expect(cityValue('AR', null)).toBe('__unknown__');
  });

  it('keeps the acquisition value splittable', () => {
    expect(acquisitionKey('Referral', 'a|b.com', '/x')).toBe('Referral | a/b.com | /x');
  });
});

describe('live window', () => {
  it('redoes only today and yesterday', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(service, 'rollupWindow').mockResolvedValue(null);
    try {
      service.scheduleLive(project);
      await vi.advanceTimersByTimeAsync(10_000);

      const today = todayIn(project.timezone);
      expect(LIVE_DAYS).toBe(2);
      expect(spy).toHaveBeenCalledWith(project, addDays(today, -1), today, { live: true });
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});
