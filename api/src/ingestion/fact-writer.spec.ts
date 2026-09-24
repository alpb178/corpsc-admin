import 'dotenv/config';
import { PrismaClient, ProjectKind, RunStatus, RunTrigger } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FactWriterService, EmptyResultError } from './fact-writer.service';
import { toUtcDate } from './common/dates';
import { TOTAL, TOTAL_DIMENSION, type MetricRow } from './common/metric-row';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * These tests hit a real Postgres. The logic they test —idempotent upsert and
 * orphan deletion— lives in SQL, so with a mock nothing would actually be
 * tested.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const writer = new FactWriterService(prisma as unknown as PrismaService);

const SLUG = 'test-fact-writer';
const FROM = '2026-03-01';
const TO = '2026-03-03';

let projectId: string;
let runId: string;

function row(date: string, dimValue: string, value: number, metricKey = 'sessions'): MetricRow {
  return { date, metricKey, dimension: dimValue === TOTAL ? TOTAL_DIMENSION : 'country', dimValue, value };
}

async function newRun(): Promise<string> {
  const run = await prisma.ingestionRun.create({
    data: {
      projectId,
      trigger: RunTrigger.PUSH,
      status: RunStatus.SUCCESS,
      windowFrom: toUtcDate(FROM),
      windowTo: toUtcDate(TO),
    },
  });
  return run.id;
}

function storedRows() {
  return prisma.metricDaily.findMany({
    where: { projectId },
    orderBy: [{ date: 'asc' }, { dimValue: 'asc' }],
    select: { date: true, metricKey: true, dimension: true, dimValue: true, value: true },
  });
}

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  const project = await prisma.project.create({
    data: { slug: SLUG, name: 'Test', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN },
  });
  projectId = project.id;
});

beforeEach(async () => {
  await prisma.metricDaily.deleteMany({ where: { projectId } });
  runId = await newRun();
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('FactWriterService', () => {
  it('writes the rows of the window', async () => {
    const result = await writer.write({
      projectId,
      runId,
      from: FROM,
      to: TO,
      rows: [row('2026-03-01', TOTAL, 100), row('2026-03-01', 'BO', 60)],
    });

    expect(result.rowsWritten).toBe(2);
    expect(result.rowsDeleted).toBe(0);
    expect(await storedRows()).toHaveLength(2);
  });

  it('re-ingesting the same data does not duplicate and updates the value', async () => {
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 100)],
    });

    // A pending order that gets paid: the same day comes back with another number.
    const second = await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 115)],
    });

    const stored = await storedRows();
    expect(stored).toHaveLength(1);
    expect(Number(stored[0].value)).toBe(115);
    expect(second.rowsDeleted).toBe(0);
  });

  it('deletes the rows the source no longer returns', async () => {
    // 'CL' was in the top-N yesterday; today it isn't. If it weren't deleted, it
    // would stay frozen with its old value and the breakdown would stop adding
    // up to the total.
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', 'BO', 60), row('2026-03-01', 'CL', 5)],
    });

    const second = await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', 'BO', 60)],
    });

    expect(second.rowsDeleted).toBe(1);
    expect((await storedRows()).map((r) => r.dimValue)).toEqual(['BO']);
  });

  it('only deletes orphans on the days it can speak for', async () => {
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', 'BO', 60), row('2026-03-02', 'CL', 5)],
    });

    // Rewrites the 1st only: the 2nd, with no rows now, is left as it was.
    const second = await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', 'BO', 61)],
      onlyDates: ['2026-03-01'],
    });

    expect(second.rowsDeleted).toBe(0);
    expect((await storedRows()).map((r) => [r.dimValue, Number(r.value)])).toEqual([['BO', 61], ['CL', 5]]);
  });

  it('does not touch what is outside the window', async () => {
    await writer.write({
      projectId, runId, from: '2026-02-01', to: '2026-02-28',
      rows: [row('2026-02-15', TOTAL, 999)],
    });

    await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 100)],
    });

    const dates = (await storedRows()).map((r) => r.date.toISOString().slice(0, 10));
    expect(dates).toContain('2026-02-15');
  });

  it('deletes NOTHING if the source returns zero rows while data exists', async () => {
    // The most dangerous failure in the design: a permissions change or a
    // mistyped id return 200 with zero rows, and orphan deletion would wipe out
    // good data. It must abort, not empty.
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 100), row('2026-03-02', TOTAL, 120)],
    });

    await expect(
      writer.write({
        projectId, runId: await newRun(), from: FROM, to: TO, rows: [],
      }),
    ).rejects.toThrow(EmptyResultError);

    expect(await storedRows()).toHaveLength(2);
  });

  it('accepts zero rows if the window was also empty', async () => {
    const result = await writer.write({
      projectId, runId, from: FROM, to: TO, rows: [],
    });

    expect(result).toEqual({ rowsWritten: 0, rowsDeleted: 0 });
  });

  it('writes large batches in one go', async () => {
    const rows = Array.from({ length: 2_500 }, (_, i) =>
      row('2026-03-01', `country-${i}`, i + 1),
    );

    const result = await writer.write({
      projectId, runId, from: FROM, to: TO, rows,
    });

    expect(result.rowsWritten).toBe(2_500);
  });
});
