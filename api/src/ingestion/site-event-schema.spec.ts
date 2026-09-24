import 'dotenv/config';
import { PrismaClient, ProjectKind, SiteEventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { toUtcDate } from './common/dates';

/**
 * The guarantees of contract v2 that live in the schema, not in code:
 * deduplication by `event_id` and one row per visitor and day. Against a real
 * Postgres, because a mock would only test the mock.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SLUG = 'test-site-event-schema';
let projectId: string;

function event(overrides: { eventId?: string | null; sessionId?: string } = {}) {
  return {
    projectId,
    type: SiteEventType.PAGE_VIEW,
    sessionId: overrides.sessionId ?? 'session-schema-a',
    path: '/es',
    eventId: overrides.eventId ?? null,
    occurredAt: new Date('2026-03-01T15:00:00Z'),
  };
}

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  ({ id: projectId } = await prisma.project.create({
    data: { slug: SLUG, name: 'Test schema', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN },
    select: { id: true },
  }));
});

beforeEach(async () => {
  await prisma.siteEvent.deleteMany({ where: { projectId } });
  await prisma.visitorDaily.deleteMany({ where: { projectId } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('site_event v2 schema', () => {
  const EVENT_ID = '0b6f1c1e-3d4a-4c8e-9a52-7a1f0e2b9c11';

  it('stores a beacon sent twice only once', async () => {
    const first = await prisma.siteEvent.createMany({ data: [event({ eventId: EVENT_ID })], skipDuplicates: true });
    const again = await prisma.siteEvent.createMany({ data: [event({ eventId: EVENT_ID })], skipDuplicates: true });

    expect(first.count).toBe(1);
    expect(again.count).toBe(0);
    expect(await prisma.siteEvent.count({ where: { projectId } })).toBe(1);
  });

  it('keeps every v1 event, which carries no event id', async () => {
    const { count } = await prisma.siteEvent.createMany({
      data: [event(), event(), event({ sessionId: 'session-schema-b' })],
      skipDuplicates: true,
    });

    expect(count).toBe(3);
  });

  it('only deduplicates within a project', async () => {
    const other = await prisma.project.create({
      data: { slug: `${SLUG}-other`, name: 'Other', domain: `${SLUG}-other.invalid`, kind: ProjectKind.OWN },
      select: { id: true },
    });

    try {
      await prisma.siteEvent.createMany({ data: [event({ eventId: EVENT_ID })] });
      const { count } = await prisma.siteEvent.createMany({
        data: [{ ...event({ eventId: EVENT_ID }), projectId: other.id }],
        skipDuplicates: true,
      });
      expect(count).toBe(1);
    } finally {
      await prisma.project.delete({ where: { id: other.id } });
    }
  });

  it('accepts the custom event type with its name and properties', async () => {
    await prisma.siteEvent.create({
      data: { ...event(), type: SiteEventType.CUSTOM, name: 'contact_submit', props: { plan: 'pro' } },
    });

    const stored = await prisma.siteEvent.findFirstOrThrow({ where: { projectId } });
    expect(stored.type).toBe(SiteEventType.CUSTOM);
    expect(stored.props).toEqual({ plan: 'pro' });
  });

  it('keeps one visitor row per day', async () => {
    const row = { projectId, date: toUtcDate('2026-03-01'), visitorId: 'visitor-schema-a' };

    await prisma.visitorDaily.createMany({ data: [row, row], skipDuplicates: true });
    await prisma.visitorDaily.createMany({
      data: [{ ...row, date: toUtcDate('2026-03-02') }],
      skipDuplicates: true,
    });

    expect(await prisma.visitorDaily.count({ where: { projectId } })).toBe(2);
  });

  it('removes the project goals and visitors along with the project', async () => {
    const doomed = await prisma.project.create({
      data: { slug: `${SLUG}-doomed`, name: 'Doomed', domain: `${SLUG}-doomed.invalid`, kind: ProjectKind.OWN },
      select: { id: true },
    });
    await prisma.conversionGoal.create({
      data: { projectId: doomed.id, eventName: 'contact_submit', label: 'Formulario de contacto' },
    });
    await prisma.visitorDaily.create({
      data: { projectId: doomed.id, date: toUtcDate('2026-03-01'), visitorId: 'visitor-doomed' },
    });

    await prisma.project.delete({ where: { id: doomed.id } });

    expect(await prisma.conversionGoal.count({ where: { projectId: doomed.id } })).toBe(0);
    expect(await prisma.visitorDaily.count({ where: { projectId: doomed.id } })).toBe(0);
  });
});
