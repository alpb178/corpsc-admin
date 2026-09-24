import { Logger } from '@nestjs/common';
import { FreshnessService } from './freshness.service';
import type { PrismaService } from '../prisma/prisma.service';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

function service(projects: Array<{ slug: string; name: string; lastPushAt: Date | null; credentialId: string | null }>) {
  const prisma = { project: { findMany: vi.fn().mockResolvedValue(projects) } };
  return new FreshnessService(prisma as unknown as PrismaService);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FreshnessService', () => {
  it.each([
    [null, 'NEVER', null],
    [2, 'OK', 2],
    [30, 'OK', 30],
    [31, 'LATE', 31],
    [72, 'LATE', 72],
    [73, 'STALE', 73],
  ])('classifies a last push %s hours ago as %s', (hours, freshness, hoursSince) => {
    expect(service([]).classify(hours === null ? null : hoursAgo(hours), NOW)).toEqual({ freshness, hoursSince });
  });

  it('reports only projects with a key: one without it is pending setup, not silent', async () => {
    const report = await service([
      { slug: 'take', name: 'Take', lastPushAt: hoursAgo(1), credentialId: 'c1' },
      { slug: 'new', name: 'New', lastPushAt: null, credentialId: null },
    ]).report();

    expect(report).toEqual([
      { slug: 'take', name: 'Take', lastPushAt: hoursAgo(1), freshness: 'OK', hoursSince: 1 },
    ]);
  });

  it('warns about the stale and the never-pushed, once a day', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await service([
      { slug: 'take', name: 'Take', lastPushAt: hoursAgo(100), credentialId: 'c1' },
      { slug: 'iris', name: 'Iris', lastPushAt: null, credentialId: 'c2' },
      { slug: 'corpsc', name: 'CORPSC', lastPushAt: hoursAgo(1), credentialId: 'c3' },
    ]).check();

    expect(warn).toHaveBeenCalledWith('No recent data from: take (100 h), iris (never pushed)');
  });

  it('stays quiet when everyone has pushed', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await service([{ slug: 'take', name: 'Take', lastPushAt: hoursAgo(5), credentialId: 'c1' }]).check();
    expect(warn).not.toHaveBeenCalled();
  });
});
