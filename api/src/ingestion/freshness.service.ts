import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Past this point a silence stops being normal and becomes a warning. */
const WARN_AFTER_HOURS = 30;
/** And past this one, a problem. */
const STALE_AFTER_HOURS = 72;

export type Freshness = 'OK' | 'LATE' | 'STALE' | 'NEVER';

export interface ProjectFreshness {
  slug: string;
  name: string;
  lastPushAt: Date | null;
  hoursSince: number | null;
  freshness: Freshness;
}

/**
 * Watches that projects keep pushing.
 *
 * It's the flip side of receiving instead of fetching: when the hub pulled
 * from Google, a failure left a visible red ingestion. Now, if a project's
 * cron breaks, nothing visible happens — data simply stops arriving, and the
 * chart goes flat without anyone knowing why.
 *
 * That's why silence is a first-class signal and not a side effect.
 */
@Injectable()
export class FreshnessService {
  private readonly logger = new Logger(FreshnessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Classifies a last-push instant. The single definition of "up to date". */
  classify(lastPushAt: Date | null, now = Date.now()): { freshness: Freshness; hoursSince: number | null } {
    if (!lastPushAt) return { freshness: 'NEVER', hoursSince: null };

    const hours = (now - lastPushAt.getTime()) / 3_600_000;
    const freshness: Freshness =
      hours > STALE_AFTER_HOURS ? 'STALE' : hours > WARN_AFTER_HOURS ? 'LATE' : 'OK';

    return { freshness, hoursSince: Math.round(hours) };
  }

  async report(): Promise<ProjectFreshness[]> {
    const projects = await this.prisma.project.findMany({
      where: { active: true },
      select: { slug: true, name: true, lastPushAt: true, credentialId: true },
      orderBy: [{ sortOrder: 'asc' }],
    });

    const now = Date.now();

    return projects
      // A project without a key isn't connected yet: it isn't quiet, it's
      // pending setup. Mixing them would fill the report with noise.
      .filter((p) => p.credentialId !== null)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        lastPushAt: p.lastPushAt,
        ...this.classify(p.lastPushAt, now),
      }));
  }

  /** Once a day, mid-morning: the time by which everyone should have pushed. */
  @Cron('0 0 10 * * *', { timeZone: 'America/La_Paz', name: 'freshness-check' })
  async check(): Promise<void> {
    const silent = (await this.report()).filter(
      (p) => p.freshness === 'STALE' || p.freshness === 'NEVER',
    );

    if (silent.length === 0) return;

    this.logger.warn(
      `No recent data from: ${silent
        .map((p) => `${p.slug} (${p.hoursSince === null ? 'never pushed' : `${p.hoursSince} h`})`)
        .join(', ')}`,
    );
  }
}
