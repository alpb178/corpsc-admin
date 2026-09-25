import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  acquisitionKey,
  ELEMENT_SEPARATOR,
  EventRollupService,
  ROLLUP_METRIC_KEYS,
  UNKNOWN,
  type RollupProject,
  type VisitStart,
} from '../ingestion/event-rollup.service';
import { channelOf, sourceOf } from '../ingestion/common/channel';
import { addDays, fromUtcDate, isIsoDate, toUtcDate, type IsoDate } from '../ingestion/common/dates';
import type { DeleteRowsDto, RecordTable } from './dto/delete-rows.dto';

export interface DeleteRowsResult {
  /** Raw events removed. */
  deletedEvents: number;
  /** Days of the period recomputed from the events that remain. */
  recomputedDays: number;
  /** Days that had events and have none left: their rolled-up rows went with them. */
  emptiedDays: number;
  /** Days whose events were already pruned: only the row itself could go. */
  clearedDays: number;
}

export interface WipeResult {
  events: number;
  metrics: number;
  visitorDays: number;
  runs: number;
}

/** The breakdown each table is stored under in `metric_daily`. */
const DIMENSION: Record<Exclude<RecordTable, 'recent'>, string> = {
  page: 'path',
  element: 'element',
  landing: 'landing',
  exit: 'exit',
  acquisition: 'acquisition',
};

/**
 * Deletes what the panel's tables show, at the source.
 *
 * The tables are rolled-up rows, but the rows are made from raw events, so
 * deleting a row means deleting its events and rolling the period up again;
 * otherwise the row would be back the next night. Only the period on screen
 * is touched: the request says which days, and nothing outside them moves.
 *
 * Three kinds of day come out of that:
 *  - a day that still has events is recomputed, so every breakdown adds up
 *    again;
 *  - a day that had events and now has none loses its rolled-up rows too, or
 *    it would keep counting visits that no longer exist;
 *  - a day whose raw events were pruned (older than the retention) can't be
 *    recomputed: only the row named is removed, and its totals stay as they
 *    were. The panel says so.
 */
@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rollup: EventRollupService,
  ) {}

  async deleteRows(slug: string, dto: DeleteRowsDto): Promise<DeleteRowsResult> {
    const project = await this.projectOf(slug);
    let { from, to } = dto;
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      throw new BadRequestException('El periodo debe ser válido y `from` no posterior a `to`');
    }

    // A single event lives on one day: that day is the period, whatever the screen showed.
    if (dto.table === 'recent') {
      const day = await this.dayOfEvent(project, dto.key);
      from = day;
      to = day;
    }

    const daysBefore = await this.daysWithEvents(project, from, to);
    const deletedEvents = await this.deleteEvents(project, dto.table, dto.key, from, to);
    const daysAfter = await this.daysWithEvents(project, from, to);

    if (daysAfter.length > 0) await this.rollup.rollupWindow(project, from, to);

    const emptied = daysBefore.filter((d) => !daysAfter.includes(d));
    const pruned: IsoDate[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (!daysBefore.includes(d)) pruned.push(d);

    if (emptied.length > 0) {
      await this.prisma.metricDaily.deleteMany({
        where: {
          projectId: project.id,
          date: { in: emptied.map(toUtcDate) },
          metricKey: { in: ROLLUP_METRIC_KEYS },
        },
      });
    }

    // Only the days that actually held the row count as cleared: a period of
    // 28 quiet days must not read as "27 days changed".
    let clearedDays = 0;
    if (dto.table !== 'recent' && pruned.length > 0) {
      const where = {
        projectId: project.id,
        date: { in: pruned.map(toUtcDate) },
        dimension: DIMENSION[dto.table],
        dimValue: dto.key,
      };
      const held = await this.prisma.metricDaily.findMany({ where, select: { date: true }, distinct: ['date'] });
      if (held.length > 0) await this.prisma.metricDaily.deleteMany({ where });
      clearedDays = held.length;
    }

    this.logger.log(
      `${slug}: deleted ${deletedEvents} events of ${dto.table} "${dto.key}" in ${from}..${to} ` +
        `(recomputed ${daysAfter.length}, emptied ${emptied.length}, cleared ${clearedDays} days)`,
    );

    return { deletedEvents, recomputedDays: daysAfter.length, emptiedDays: emptied.length, clearedDays };
  }

  /**
   * Everything the project ever sent: raw events, rolled-up and pushed
   * metrics, visitor-days and the submissions log. The project itself, its
   * key and its goals stay: it can send again tomorrow.
   */
  async wipe(slug: string): Promise<WipeResult> {
    const project = await this.projectOf(slug);
    const where = { projectId: project.id };

    const [events, metrics, visitorDays, runs] = await this.prisma.$transaction([
      this.prisma.siteEvent.deleteMany({ where }),
      this.prisma.metricDaily.deleteMany({ where }),
      this.prisma.visitorDaily.deleteMany({ where }),
      this.prisma.ingestionRun.deleteMany({ where }),
    ]);

    this.logger.warn(
      `${slug}: wiped ${events.count} events, ${metrics.count} metric rows, ${visitorDays.count} visitor-days, ${runs.count} runs`,
    );
    return { events: events.count, metrics: metrics.count, visitorDays: visitorDays.count, runs: runs.count };
  }

  // ─────────────────────────── Internals ───────────────────────────

  private async projectOf(slug: string): Promise<RollupProject> {
    const project = await this.prisma.project.findUnique({ where: { slug } });
    if (!project) throw new NotFoundException(`No existe el proyecto "${slug}"`);
    return project;
  }

  /** The local day an event happened on, for the project's zone. */
  private async dayOfEvent(project: RollupProject, key: string): Promise<IsoDate> {
    if (!/^\d{1,19}$/.test(key)) throw new BadRequestException('El id del evento no es válido');
    const rows = await this.prisma.$queryRaw<Array<{ day: Date }>>`
      SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${project.timezone})::date AS day
        FROM site_event
       WHERE project_id = ${project.id} AND id = ${BigInt(key)}`;
    if (rows.length === 0) throw new NotFoundException('Ese evento ya no existe');
    return fromUtcDate(rows[0].day);
  }

  /** The days of the window that have at least one raw event. */
  private async daysWithEvents(project: RollupProject, from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
    const rows = await this.prisma.$queryRaw<Array<{ day: Date }>>`
      SELECT DISTINCT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${project.timezone})::date AS day
        FROM site_event
       WHERE project_id = ${project.id} AND ${this.window(project, from, to)}`;
    return rows.map((r) => fromUtcDate(r.day)).sort();
  }

  /**
   * The window clause: the UTC bounds are what the index can use; the local
   * day is what the period means. Both, as in the rollup.
   */
  private window(project: RollupProject, from: IsoDate, to: IsoDate): Prisma.Sql {
    return Prisma.sql`
      occurred_at >= ${toUtcDate(addDays(from, -1))} AND occurred_at < ${toUtcDate(addDays(to, 2))}
      AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${project.timezone})::date
          BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date`;
  }

  private async deleteEvents(
    project: RollupProject,
    table: RecordTable,
    key: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<number> {
    switch (table) {
      case 'recent':
        return this.prisma.$executeRaw`
          DELETE FROM site_event WHERE project_id = ${project.id} AND id = ${BigInt(key)}`;

      case 'page':
        return this.prisma.$executeRaw`
          DELETE FROM site_event
           WHERE project_id = ${project.id} AND path = ${key} AND ${this.window(project, from, to)}`;

      case 'element': {
        // The key was built from the event's own fields, with "|" turned
        // into "/" and the ends trimmed; an element whose label carried a
        // "|" is the one case this can't find again.
        const [path = '', section = '', label = ''] = key.split(ELEMENT_SEPARATOR);
        if (!path || !section || !label) throw new BadRequestException('La clave del elemento debe ser "página | sección | etiqueta"');
        return this.prisma.$executeRaw`
          DELETE FROM site_event
           WHERE project_id = ${project.id}
             AND type IN ('CLICK', 'SITE_CLICK')
             AND path = ${path} AND section = ${section} AND label = ${label}
             AND ${this.window(project, from, to)}`;
      }

      case 'landing':
      case 'exit':
      case 'acquisition': {
        // These rows are visits, not events: the whole visit goes, on the day
        // it was counted, the same way the rollup found it.
        const starts = await this.rollup.visitStarts(project, from, to);
        const hits = starts.filter((s) => this.visitKey(table, s) === key);
        if (hits.length === 0) return 0;
        const pairs = hits.map((s) => Prisma.sql`(${fromUtcDate(s.day)}::date, ${s.session_id})`);
        return this.prisma.$executeRaw`
          DELETE FROM site_event
           WHERE project_id = ${project.id}
             AND ${this.window(project, from, to)}
             AND ((occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${project.timezone})::date, session_id)
                 IN (${Prisma.join(pairs)})`;
      }
    }
  }

  /** The key the panel shows for a visit in each of the visit tables. */
  private visitKey(table: 'landing' | 'exit' | 'acquisition', start: VisitStart): string {
    if (table === 'landing') return start.landing ?? UNKNOWN;
    if (table === 'exit') return start.exit ?? UNKNOWN;
    const origin = { referrer: start.referrer, utmSource: start.utm_source, utmMedium: start.utm_medium };
    return acquisitionKey(channelOf(origin), sourceOf(origin).slice(0, 512), start.landing ?? UNKNOWN);
  }
}
