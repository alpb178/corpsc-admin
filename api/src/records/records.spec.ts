import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, ProjectKind, SiteEventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { RecordsService } from './records.service';
import { elementKey, EventRollupService } from '../ingestion/event-rollup.service';
import { FactWriterService } from '../ingestion/fact-writer.service';
import { toUtcDate } from '../ingestion/common/dates';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Against a real Postgres: deleting a row is a delete in SQL, in the
 * project's time zone, followed by the rollup, and a mock would test none of
 * it. Days in 2029, which no other spec touches.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const db = prisma as unknown as PrismaService;
const rollup = new EventRollupService(db, new FactWriterService(db));
const records = new RecordsService(db, rollup);

const SLUG = 'test-records';
const DAY1 = '2029-04-01';
const DAY2 = '2029-04-02';
const RANGE = { from: DAY1, to: DAY2 };

let project: { id: string; slug: string; timezone: string };

interface Seed {
  session: string;
  at: string;
  type?: SiteEventType;
  path?: string;
  section?: string;
  label?: string;
  referrer?: string;
}

async function seed(events: Seed[]): Promise<void> {
  await prisma.siteEvent.createMany({
    data: events.map((e) => ({
      projectId: project.id,
      type: e.type ?? SiteEventType.PAGE_VIEW,
      sessionId: e.session,
      path: e.path ?? '/es',
      section: e.section ?? null,
      label: e.label ?? null,
      referrer: e.referrer ?? null,
      occurredAt: new Date(e.at),
    })),
  });
}

/** One rolled-up figure, or null when the row isn't there. */
async function metric(metricKey: string, dimension: string, dimValue: string, date: string): Promise<number | null> {
  const row = await prisma.metricDaily.findFirst({
    where: { projectId: project.id, metricKey, dimension, dimValue, date: toUtcDate(date) },
  });
  return row ? Number(row.value) : null;
}

const eventsLeft = () => prisma.siteEvent.count({ where: { projectId: project.id } });

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  project = await prisma.project.create({
    data: { slug: SLUG, name: 'Test records', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN, timezone: 'America/La_Paz' },
    select: { id: true, slug: true, timezone: true },
  });
});

beforeEach(async () => {
  for (const table of ['siteEvent', 'metricDaily', 'ingestionRun', 'visitorDaily'] as const) {
    await (prisma[table] as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({ where: { projectId: project.id } });
  }
  // Day 1 (La Paz): A reads /es from Google, clicks the hero, goes on to
  // /es/ofertas; B lands straight on /es/ofertas. Day 2: C reads /es.
  await seed([
    { session: 'A', at: '2029-04-01T14:00:00Z', referrer: 'https://www.google.com/' },
    { session: 'A', at: '2029-04-01T14:01:00Z', type: SiteEventType.CLICK, section: 'hero', label: 'CTA' },
    { session: 'A', at: '2029-04-01T14:02:00Z', path: '/es/ofertas' },
    { session: 'B', at: '2029-04-01T16:00:00Z', path: '/es/ofertas' },
    { session: 'C', at: '2029-04-02T15:00:00Z' },
  ]);
  await rollup.rollupWindow(project, DAY1, DAY2);
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('RecordsService.deleteRows', () => {
  it('starts from a rolled-up period', async () => {
    expect(await metric('visits', 'total', '__total__', DAY1)).toBe(2);
    expect(await metric('page_views', 'path', '/es/ofertas', DAY1)).toBe(2);
    expect(await metric('clicks', 'element', elementKey('/es', 'hero', 'CTA'), DAY1)).toBe(1);
  });

  it('removes a page: its views go, and the visits that remain are recounted', async () => {
    const result = await records.deleteRows(SLUG, { table: 'page', key: '/es/ofertas', ...RANGE });

    expect(result).toEqual({ deletedEvents: 2, recomputedDays: 2, emptiedDays: 0, clearedDays: 0 });
    expect(await metric('page_views', 'path', '/es/ofertas', DAY1)).toBeNull();
    expect(await metric('page_views', 'path', '/es', DAY1)).toBe(1);
    // B only ever saw /es/ofertas: without it, B was never here.
    expect(await metric('visits', 'total', '__total__', DAY1)).toBe(1);
    expect(await metric('visits', 'total', '__total__', DAY2)).toBe(1);
  });

  it('removes the visits that landed on a page, and empties a day left with nothing', async () => {
    const result = await records.deleteRows(SLUG, { table: 'landing', key: '/es', ...RANGE });

    // A (three events) and C (one) landed on /es; B stays.
    expect(result).toEqual({ deletedEvents: 4, recomputedDays: 1, emptiedDays: 1, clearedDays: 0 });
    expect(await eventsLeft()).toBe(1);
    expect(await metric('visits', 'total', '__total__', DAY1)).toBe(1);
    expect(await metric('visits', 'total', '__total__', DAY2)).toBeNull();
    expect(await prisma.metricDaily.count({ where: { projectId: project.id, date: toUtcDate(DAY2) } })).toBe(0);
  });

  it('counts a visit with no page view that day as unknown landing and exit, and finds nothing for a page nobody used', async () => {
    // D only clicked that day: no landing, no exit. The panel lists it as "Desconocido".
    await seed([{ session: 'D', at: '2029-04-02T12:00:00Z', type: SiteEventType.CLICK, section: 'nav', label: 'Menu' }]);
    await rollup.rollupWindow(project, DAY1, DAY2);

    expect((await records.deleteRows(SLUG, { table: 'landing', key: '/none', ...RANGE })).deletedEvents).toBe(0);
    expect((await records.deleteRows(SLUG, { table: 'exit', key: '__unknown__', ...RANGE })).deletedEvents).toBe(1);
    expect((await records.deleteRows(SLUG, { table: 'acquisition', key: 'x', ...RANGE })).deletedEvents).toBe(0);
    expect(await eventsLeft()).toBe(5);
  });

  it('removes the visits that left from a page', async () => {
    const result = await records.deleteRows(SLUG, { table: 'exit', key: '/es/ofertas', ...RANGE });
    // A and B both ended on /es/ofertas.
    expect(result.deletedEvents).toBe(4);
    expect(await metric('visits', 'total', '__total__', DAY1)).toBeNull();
  });

  it('removes the visits of one way in, as the panel names it', async () => {
    const row = await prisma.metricDaily.findFirst({
      where: { projectId: project.id, dimension: 'acquisition', date: toUtcDate(DAY1), NOT: { dimValue: { startsWith: '__direct__' } } },
    });
    expect(row?.dimValue).toContain('google');

    const result = await records.deleteRows(SLUG, { table: 'acquisition', key: row!.dimValue, ...RANGE });
    expect(result.deletedEvents).toBe(3);
    expect(await metric('visits', 'total', '__total__', DAY1)).toBe(1);
    expect(await metric('visits', 'acquisition', row!.dimValue, DAY1)).toBeNull();
  });

  it('removes one clicked element', async () => {
    const result = await records.deleteRows(SLUG, { table: 'element', key: elementKey('/es', 'hero', 'CTA'), ...RANGE });
    expect(result.deletedEvents).toBe(1);
    expect(await metric('clicks', 'element', elementKey('/es', 'hero', 'CTA'), DAY1)).toBeNull();
    expect(await metric('visits', 'total', '__total__', DAY1)).toBe(2);
  });

  it('removes one raw event by id, on its own day whatever the period says', async () => {
    const b = await prisma.siteEvent.findFirst({ where: { projectId: project.id, sessionId: 'B' }, select: { id: true } });

    const result = await records.deleteRows(SLUG, { table: 'recent', key: String(b!.id), from: '2029-01-01', to: '2029-01-02' });
    expect(result).toEqual({ deletedEvents: 1, recomputedDays: 1, emptiedDays: 0, clearedDays: 0 });
    expect(await metric('visits', 'total', '__total__', DAY1)).toBe(1);
    expect(await metric('page_views', 'path', '/es/ofertas', DAY1)).toBe(1);
  });

  it('on a day whose events were pruned, removes the row named and nothing else', async () => {
    const OLD = '2029-03-20';
    await prisma.metricDaily.createMany({
      data: [
        { projectId: project.id, date: toUtcDate(OLD), metricKey: 'visits', dimension: 'total', dimValue: '__total__', value: 9 },
        { projectId: project.id, date: toUtcDate(OLD), metricKey: 'page_views', dimension: 'path', dimValue: '/old', value: 4 },
      ],
    });

    const result = await records.deleteRows(SLUG, { table: 'page', key: '/old', from: OLD, to: OLD });
    expect(result).toEqual({ deletedEvents: 0, recomputedDays: 0, emptiedDays: 0, clearedDays: 1 });
    expect(await metric('page_views', 'path', '/old', OLD)).toBeNull();
    // Totals can't be recomputed without the events: they stay.
    expect(await metric('visits', 'total', '__total__', OLD)).toBe(9);
  });

  it('refuses what it cannot find or understand', async () => {
    await expect(records.deleteRows('nope', { table: 'page', key: '/es', ...RANGE })).rejects.toBeInstanceOf(NotFoundException);
    await expect(records.deleteRows(SLUG, { table: 'page', key: '/es', from: DAY2, to: DAY1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(records.deleteRows(SLUG, { table: 'element', key: 'broken', ...RANGE })).rejects.toBeInstanceOf(BadRequestException);
    await expect(records.deleteRows(SLUG, { table: 'recent', key: 'abc', ...RANGE })).rejects.toBeInstanceOf(BadRequestException);
    await expect(records.deleteRows(SLUG, { table: 'recent', key: '999999999', ...RANGE })).rejects.toBeInstanceOf(NotFoundException);
    // A row that isn't there is not an error: nothing to delete, nothing changed.
    expect(await records.deleteRows(SLUG, { table: 'page', key: '/nothing', from: '2029-03-01', to: DAY2 })).toEqual({
      deletedEvents: 0,
      recomputedDays: 2,
      emptiedDays: 0,
      clearedDays: 0,
    });
  });
});

describe('RecordsService.wipe', () => {
  it('deletes everything the site sent and keeps the site', async () => {
    const result = await records.wipe(SLUG);

    expect(result.events).toBe(5);
    expect(result.metrics).toBeGreaterThan(0);
    expect(result.runs).toBe(1);
    expect(await eventsLeft()).toBe(0);
    expect(await prisma.metricDaily.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.ingestionRun.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.project.findUnique({ where: { slug: SLUG } })).not.toBeNull();
    await expect(records.wipe('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
