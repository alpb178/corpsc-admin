import { BadRequestException } from '@nestjs/common';
import { Prisma, SiteEventType } from '@prisma/client';
import { SiteEventsService } from './site-events.service';
import { MAX_EVENT_AGE_HOURS, type SiteEventDto, type SiteEventsDto } from './site-events.contract';
import type { EventRollupService } from './event-rollup.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushingProject } from './api-key.guard';

const PROJECT: PushingProject = { id: 'p1', slug: 'corpsc', timezone: 'America/La_Paz', currency: null };
const NOW = new Date('2026-03-10T12:00:00.000Z');

function makeService(stored?: number) {
  const createMany = vi.fn().mockImplementation(({ data }: { data: unknown[] }) =>
    Promise.resolve({ count: stored ?? data.length }),
  );
  const scheduleLive = vi.fn();
  const service = new SiteEventsService(
    { siteEvent: { createMany } } as unknown as PrismaService,
    { scheduleLive } as unknown as EventRollupService,
  );
  /** The rows handed to Postgres. */
  const rows = () => createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
  return { service, createMany, scheduleLive, rows };
}

function payload(...events: Array<Partial<SiteEventDto>>): SiteEventsDto {
  return {
    schemaVersion: 2,
    events: events.map((e) => ({ type: 'page_view', sessionId: 'session-aaaa', path: '/es', ...e })),
  } as SiteEventsDto;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SiteEventsService', () => {
  it('stores a v1 page view with every v2 column empty', async () => {
    const { service, rows } = makeService();

    await service.receive(PROJECT, { schemaVersion: 1, events: payload({}).events } as SiteEventsDto);

    expect(rows()[0]).toMatchObject({
      projectId: 'p1',
      type: SiteEventType.PAGE_VIEW,
      sessionId: 'session-aaaa',
      path: '/es',
      eventId: null,
      visitorId: null,
      name: null,
      props: Prisma.DbNull,
      region: null,
      city: null,
      device: null,
      browser: null,
      os: null,
      language: null,
      screen: null,
      occurredAt: NOW,
    });
  });

  it('stores the v2 context of any event', async () => {
    const { service, rows } = makeService();

    await service.receive(
      PROJECT,
      payload({
        type: 'click',
        section: 'hero',
        label: 'Ver proyectos',
        eventId: '0B6F1C1E-3D4A-4C8E-9A52-7A1F0E2B9C11',
        visitorId: 'visitor-aaaa',
        region: 'L',
        city: 'La Paz',
        device: 'mobile',
        browser: 'Chrome',
        os: 'Android',
        language: 'es',
        screen: 'sm',
      }),
    );

    expect(rows()[0]).toMatchObject({
      type: SiteEventType.CLICK,
      section: 'hero',
      label: 'Ver proyectos',
      // A UUID in capitals is the same beacon.
      eventId: '0b6f1c1e-3d4a-4c8e-9a52-7a1f0e2b9c11',
      visitorId: 'visitor-aaaa',
      region: 'L',
      city: 'La Paz',
      device: 'mobile',
      browser: 'Chrome',
      os: 'Android',
      language: 'es',
      screen: 'sm',
    });
  });

  it('stores a custom event with its name and properties', async () => {
    const { service, rows } = makeService();

    await service.receive(PROJECT, payload({ type: 'custom', name: 'contact_submit', props: { plan: 'pro' } }));

    expect(rows()[0]).toMatchObject({
      type: SiteEventType.CUSTOM,
      name: 'contact_submit',
      props: { plan: 'pro' },
      section: null,
      label: null,
    });
  });

  it('keeps name and properties only on custom events', async () => {
    const { service, rows } = makeService();

    await service.receive(PROJECT, payload({ name: 'contact_submit', props: { plan: 'pro' } }));

    expect(rows()[0]).toMatchObject({ name: null, props: Prisma.DbNull });
  });

  it('rejects a custom event without a name', async () => {
    const { service, createMany } = makeService();

    await expect(service.receive(PROJECT, payload({ type: 'custom' }))).rejects.toThrow(
      BadRequestException,
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects properties that carry more than a segment', async () => {
    const { service } = makeService();

    await expect(
      service.receive(PROJECT, payload({ type: 'custom', name: 'form_sent', props: { message: 'x'.repeat(101) } })),
    ).rejects.toThrow(/props.message/);
  });

  it('rejects the whole request when one event is wrong, so nothing is half stored', async () => {
    const { service, createMany } = makeService();

    await expect(
      service.receive(PROJECT, payload({}, { type: 'site_click' }, { type: 'click', section: 'hero' })),
    ).rejects.toThrow('site_click necesita `target`');
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects a click that says nowhere it happened', async () => {
    const { service } = makeService();

    await expect(service.receive(PROJECT, payload({ type: 'click', section: 'hero' }))).rejects.toThrow(
      'click necesita `section` y `label`',
    );
  });

  it('keeps the origin only on the page view', async () => {
    const { service, rows } = makeService();
    const origin = { referrer: 'www.Google.com', utmSource: 'Instagram', utmMedium: 'Social', utmCampaign: 'Otono' };

    await service.receive(
      PROJECT,
      payload({ ...origin }, { type: 'site_click', target: 'take', linkType: 'ios', ...origin }),
    );

    expect(rows()[0]).toMatchObject({
      referrer: 'google.com',
      utmSource: 'instagram',
      utmMedium: 'social',
      utmCampaign: 'Otono',
    });
    expect(rows()[1]).toMatchObject({
      type: SiteEventType.SITE_CLICK,
      target: 'take',
      linkType: 'ios',
      referrer: null,
      utmSource: null,
    });
  });

  it('bounds the declared instant to the accepted window', async () => {
    const { service, rows } = makeService();
    const tooOld = new Date(NOW.getTime() - (MAX_EVENT_AGE_HOURS + 1) * 3_600_000).toISOString();
    const recent = new Date(NOW.getTime() - 60_000).toISOString();

    await service.receive(
      PROJECT,
      payload({ at: recent }, { at: tooOld }, { at: '2026-03-11T00:00:00.000Z' }, { at: 'not-a-date' }),
    );

    expect(rows().map((r) => (r.occurredAt as Date).toISOString())).toEqual([
      recent,
      NOW.toISOString(),
      NOW.toISOString(),
      NOW.toISOString(),
    ]);
  });

  it('asks the database to drop beacons it already has, and reports them', async () => {
    const { service, createMany } = makeService(1);

    const result = await service.receive(PROJECT, payload({}, {}));

    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(result).toEqual({ accepted: 1, duplicates: 1 });
  });

  it('asks for a live rollup when something new was stored', async () => {
    const { service, scheduleLive } = makeService();

    await service.receive(PROJECT, payload({}));

    expect(scheduleLive).toHaveBeenCalledWith(PROJECT);
  });

  it("doesn't roll up again for a request made only of copies", async () => {
    const { service, scheduleLive } = makeService(0);

    expect(await service.receive(PROJECT, payload({}))).toEqual({ accepted: 0, duplicates: 1 });
    expect(scheduleLive).not.toHaveBeenCalled();
  });
});
