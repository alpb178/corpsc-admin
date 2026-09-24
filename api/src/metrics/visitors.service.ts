import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, fromUtcDate, toUtcDate, type IsoDate } from '../ingestion/common/dates';

export interface VisitorRange {
  from: IsoDate;
  to: IsoDate;
}

export interface VisitorStats {
  /** Different visitors in the range. */
  unique: number;
  /** Of them, seen for the first time within the range. */
  new: number;
  /** Of them, already seen before the range began. */
  returning: number;
  /** Different visitors on each day, with an explicit gap on days without data. */
  daily: Array<{ date: IsoDate; value: number | null }>;
  /**
   * First day with identified visitors in this scope, or null if there are
   * none. Before it the sites sent v1 beacons: "new" can only be known from
   * here on, and on this very day every visitor is new.
   */
  since: IsoDate | null;
}

/**
 * Unique, new and returning visitors, counted at read time.
 *
 * They can't be stored as a daily metric and summed: someone who comes on
 * three days would count three times. So they're counted over
 * `visitor_daily`, one row per visitor and day, which the rollup fills from
 * the raw events and keeps long after those are pruned.
 *
 * Across the group a visitor is a (project, visitor) pair: each site issues
 * its own first-party cookie, so the same person on two sites is two visitors.
 * There's no way to join them without tracking people across domains, which
 * is precisely what the hub doesn't do.
 */
@Injectable()
export class VisitorsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(range: VisitorRange, projectId?: string): Promise<VisitorStats> {
    const from = toUtcDate(range.from);
    const to = toUtcDate(range.to);
    const scope = projectId ? Prisma.sql`AND project_id = ${projectId}` : Prisma.empty;

    const [totals, daily, since] = await Promise.all([
      this.prisma.$queryRaw<Array<{ unique: bigint; new: bigint }>>`
        WITH seen AS (
          SELECT DISTINCT project_id, visitor_id FROM visitor_daily
           WHERE date BETWEEN ${from}::date AND ${to}::date ${scope}
        )
        SELECT count(*) AS unique,
               count(*) FILTER (WHERE NOT EXISTS (
                 SELECT 1 FROM visitor_daily p
                  WHERE p.project_id = s.project_id AND p.visitor_id = s.visitor_id
                    AND p.date < ${from}::date
               )) AS new
          FROM seen s`,
      this.prisma.$queryRaw<Array<{ date: Date; total: bigint }>>`
        SELECT date, count(*) AS total FROM visitor_daily
         WHERE date BETWEEN ${from}::date AND ${to}::date ${scope}
         GROUP BY 1`,
      this.prisma.visitorDaily.aggregate({ where: projectId ? { projectId } : {}, _min: { date: true } }),
    ]);

    const unique = Number(totals[0]?.unique ?? 0);
    const fresh = Number(totals[0]?.new ?? 0);
    const byDate = new Map(daily.map((row) => [fromUtcDate(row.date), Number(row.total)]));

    const series: VisitorStats['daily'] = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      series.push({ date: d, value: byDate.get(d) ?? null });
    }

    return {
      unique,
      new: fresh,
      returning: unique - fresh,
      daily: series,
      since: since._min.date ? fromUtcDate(since._min.date) : null,
    };
  }
}
