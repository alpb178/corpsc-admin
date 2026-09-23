import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RunStatus, RunTrigger } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FactWriterService, type WriteResult } from './fact-writer.service';
import { addDays, todayIn, toUtcDate, type IsoDate } from './common/dates';
import { TOTAL, TOTAL_DIMENSION, type MetricRow } from './common/metric-row';
import { collapseToTopN } from './common/top-n';
import { MAX_EVENT_AGE_HOURS } from './site-events.contract';
import { channelOf, sourceOf } from './common/channel';

/**
 * The metrics the rollup produces, and which it therefore owns: when it
 * re-rolls a window it deletes its own for those days and writes them again,
 * without touching any other metric of the project.
 */
export const ROLLUP_METRIC_KEYS = ['visits', 'page_views', 'site_clicks', 'clicks'];

/**
 * The last few days are always re-rolled, not just yesterday.
 *
 * An event can arrive late and the project's timezone can shift relative to
 * the hub's: redoing four days costs the same and keeps a day from being left
 * wrongly balanced forever.
 */
const ROLLUP_DAYS = 4;

/**
 * The live rollup only redoes the days a freshly arrived event can land on:
 * today and the ones covered by the maximum accepted event age.
 */
const LIVE_DAYS = Math.ceil(MAX_EVENT_AGE_HOURS / 24) + 1;

/**
 * Wait after the first event before rolling up. It groups a visit's burst —the
 * page, the clicks— into a single pass instead of one per beacon, and is still
 * short enough for the panel to feel live.
 */
const LIVE_DELAY_MS = 10_000;

/** Raw events are kept just long enough to recompute, not as an archive. */
const RETENTION_DAYS = 90;

/** Cap on named values per day and dimension; the rest goes to `__other__`. */
const TOP_N = 100;

/** A visit with no known country: without it, the breakdown wouldn't add up to the total. */
export const UNKNOWN = '__unknown__';

/** Separates page, section and label in the value of the `element` dimension. */
export const ELEMENT_SEPARATOR = ' | ';

/**
 * The value of the `element` dimension: where the click happened, in full.
 *
 * It goes in a single dimension because `metric_daily` stores one per row, and
 * splitting page and element into two would lose which button was clicked on
 * which page. The pipe is stripped from the parts so the panel can split it
 * back unambiguously.
 */
export function elementKey(path: string, section: string, label: string): string {
  const clean = (part: string) => part.replace(/\|/g, '/').trim();
  return [clean(path), clean(section), clean(label)].join(ELEMENT_SEPARATOR).slice(0, 512);
}

interface RollupProject {
  id: string;
  slug: string;
  timezone: string;
}

interface DayTotals {
  day: Date;
  visits: bigint;
  page_views: bigint;
  site_clicks: bigint;
  clicks: bigint;
}

/** The first signal of each visit in the day: country, source and hour come from it. */
interface VisitStart {
  day: Date;
  hour: number;
  country: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface DayHourCount {
  day: Date;
  hour: number;
  total: bigint;
}

interface DayDimCount {
  day: Date;
  dim_value: string | null;
  total: bigint;
}

/**
 * Turns raw events into the same daily metrics any other project sends.
 *
 * A site without a backend can't aggregate its own data, so the hub does it.
 * But the result comes in through the same door as everything else
 * —`metric_daily`, additive measures, breakdowns with `__other__`— so the
 * panel doesn't need to know where each figure came from.
 *
 * The day is decided here, in the project's timezone: that's why the event is
 * stored with its UTC instant and not with an already truncated date. If a
 * project's timezone was set wrong, it gets fixed and rolled up again.
 */
@Injectable()
export class EventRollupService implements OnModuleDestroy {
  private readonly logger = new Logger(EventRollupService.name);

  /** Pending live rollups, one per project. */
  private readonly pending = new Map<string, NodeJS.Timeout>();
  /** Projects being rolled up right now, and whether something arrived meanwhile. */
  private readonly running = new Map<string, { dirty: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factWriter: FactWriterService,
  ) {}

  /**
   * In the early morning, after the time projects with their own backend push
   * and well before 10:00, which is when the hub checks who hasn't shown up.
   */
  @Cron('0 0 3 * * *', { timeZone: 'America/La_Paz', name: 'event-rollup' })
  async rollupAll(): Promise<void> {
    const projects = await this.prisma.project.findMany({
      where: { active: true },
      select: { id: true, slug: true, timezone: true },
    });

    for (const project of projects) {
      try {
        const result = await this.rollup(project);
        if (result) {
          this.logger.log(
            `${project.slug}: ${result.rowsWritten} rows rolled up from events`,
          );
        }
      } catch (error) {
        // One failing project must not leave the others without a rollup.
        this.logger.error(
          `Rollup failed for ${project.slug}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  /**
   * Requests a rollup for a project because events just arrived for it.
   *
   * This is what makes the panel reflect visits as they happen. The result is
   * not awaited: the sender shouldn't pay for the rollup, and if it fails, the
   * nightly cron tries again over the same data.
   *
   * There are never two at once for the same project: anything that arrives
   * during a rollup flags another one for when it finishes.
   */
  scheduleLive(project: RollupProject): void {
    if (this.pending.has(project.id)) return;

    const inFlight = this.running.get(project.id);
    if (inFlight) {
      inFlight.dirty = true;
      return;
    }

    const timer = setTimeout(() => {
      this.pending.delete(project.id);
      void this.runLive(project);
    }, LIVE_DELAY_MS);
    // A pending timer must not keep the process from exiting.
    timer.unref();
    this.pending.set(project.id, timer);
  }

  onModuleDestroy(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }

  private async runLive(project: RollupProject): Promise<void> {
    const state = { dirty: false };
    this.running.set(project.id, state);

    try {
      const to = todayIn(project.timezone);
      await this.rollupWindow(project, addDays(to, -(LIVE_DAYS - 1)), to, { live: true });
    } catch (error) {
      this.logger.error(
        `Live rollup failed for ${project.slug}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.running.delete(project.id);
      if (state.dirty) this.scheduleLive(project);
    }
  }

  /**
   * Rolls up a project. Returns `null` if there wasn't a single event.
   *
   * Silence is not written: a site with no events is not a site with zero
   * visits —its beacons may be broken, or nobody came in— and writing zeros
   * would make the two indistinguishable. No rows means no run, and the
   * project shows up as silent in the Envíos tab, which is exactly what's happening.
   */
  async rollup(project: RollupProject, days = ROLLUP_DAYS): Promise<WriteResult | null> {
    const to = todayIn(project.timezone);
    return this.rollupWindow(project, addDays(to, -(days - 1)), to);
  }

  /**
   * Rolls up a specific window. Used to redo history —a wrongly set timezone,
   * a bot discovered late— without waiting for the cron.
   */
  async rollupWindow(
    project: RollupProject,
    from: IsoDate,
    to: IsoDate,
    { live = false }: { live?: boolean } = {},
  ): Promise<WriteResult | null> {
    const rows = await this.aggregate(project, from, to);
    if (rows.length === 0) return null;

    const startedAt = Date.now();
    const run = await this.runFor(project, from, to, live);

    const result = await this.factWriter.write({
      projectId: project.id,
      runId: run.id,
      from,
      to,
      rows,
      ownedMetricKeys: ROLLUP_METRIC_KEYS,
    });

    await this.prisma.$transaction([
      this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: { ...result, durationMs: Date.now() - startedAt, receivedAt: new Date() },
      }),
      // Counts as a sign of life just like a submission: if the site stops
      // sending events, the Envíos tab has to find out.
      this.prisma.project.update({
        where: { id: project.id },
        data: { lastPushAt: new Date() },
      }),
    ]);

    return result;
  }

  /**
   * The rollup's run record.
   *
   * The nightly or manually launched one leaves a new record every time. The
   * live one reuses the one for its window: the window changes once a day, so
   * there's one per day and project, instead of one per visit burying
   * everyone else's submissions in the Envíos tab.
   */
  private async runFor(project: RollupProject, from: IsoDate, to: IsoDate, live: boolean) {
    const window = {
      projectId: project.id,
      trigger: RunTrigger.ROLLUP,
      windowFrom: toUtcDate(from),
      windowTo: toUtcDate(to),
    };

    if (live) {
      const existing = await this.prisma.ingestionRun.findFirst({
        where: window,
        orderBy: { receivedAt: 'desc' },
        select: { id: true },
      });
      if (existing) return existing;
    }

    return this.prisma.ingestionRun.create({
      data: { ...window, status: RunStatus.SUCCESS },
      select: { id: true },
    });
  }

  /** Deletes raw events that are no longer useful for recomputing anything. */
  @Cron('0 30 3 * * *', { timeZone: 'America/La_Paz', name: 'event-retention' })
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.siteEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });

    if (count > 0) this.logger.log(`Deleted ${count} events older than ${RETENTION_DAYS} days`);
  }

  /**
   * The queries that turn events into rows.
   *
   * The day is computed in SQL with `AT TIME ZONE 'UTC' AT TIME ZONE <zone>`
   * because the column is a timestamp without time zone holding UTC: the first
   * AT TIME ZONE declares it UTC and the second moves it to the project's
   * zone. With only one, the instant would be read as local time and the days
   * would come out shifted.
   *
   * The UTC filter on `occurred_at` isn't redundant even though the local-date
   * one already bounds the range: it's the only one that can use the index.
   * The one-day margin on each side covers any timezone offset.
   */
  private async aggregate(project: RollupProject, from: IsoDate, to: IsoDate): Promise<MetricRow[]> {
    const tz = project.timezone;
    const guardFrom = toUtcDate(addDays(from, -1));
    const guardTo = toUtcDate(addDays(to, 2));

    const totals = await this.prisma.$queryRaw<DayTotals[]>`
      SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day,
             count(DISTINCT session_id)                     AS visits,
             count(*) FILTER (WHERE type = 'PAGE_VIEW')     AS page_views,
             count(*) FILTER (WHERE type = 'SITE_CLICK')    AS site_clicks,
             count(*) FILTER (WHERE type IN ('CLICK', 'SITE_CLICK')) AS clicks
        FROM site_event
       WHERE project_id = ${project.id}
         AND occurred_at >= ${guardFrom} AND occurred_at < ${guardTo}
         AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
             BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date
       GROUP BY 1`;

    const rows: MetricRow[] = [];

    for (const day of totals) {
      const date = this.isoDay(day.day);
      rows.push(
        this.total(date, 'visits', day.visits),
        this.total(date, 'page_views', day.page_views),
        this.total(date, 'site_clicks', day.site_clicks),
        this.total(date, 'clicks', day.clicks),
      );
    }

    const byTarget = await this.breakdown(project, from, to, 'SITE_CLICK', 'target');
    const byLinkType = await this.breakdown(project, from, to, 'SITE_CLICK', 'link_type');
    const byPath = await this.breakdown(project, from, to, 'PAGE_VIEW', 'path');
    const clicksByPath = await this.clickBreakdown(project, from, to, 'path');
    const clicksByElement = await this.clickBreakdown(project, from, to, 'element');
    const visitStarts = await this.visitStarts(project, from, to);
    const pageViewsByHour = await this.pageViewsByHour(project, from, to);

    rows.push(
      // Which group site the click goes to: the portfolio's reason for being.
      ...collapseToTopN(this.dimRows(byTarget, 'site_clicks', 'project'), {
        dimension: 'project',
        topN: TOP_N,
        rankBy: 'site_clicks',
      }),
      ...collapseToTopN(this.dimRows(byLinkType, 'site_clicks', 'link_type'), {
        dimension: 'link_type',
        topN: TOP_N,
        rankBy: 'site_clicks',
      }),
      ...collapseToTopN(this.dimRows(byPath, 'page_views', 'path'), {
        dimension: 'path',
        topN: TOP_N,
        rankBy: 'page_views',
      }),
      // Which pages get clicked: shares the dimension with page views, so the
      // panel reads a path's views and clicks on the same row.
      ...collapseToTopN(this.dimRows(clicksByPath, 'clicks', 'path'), {
        dimension: 'path',
        topN: TOP_N,
        rankBy: 'clicks',
      }),
      // And what gets clicked within each one.
      ...collapseToTopN(this.dimRows(clicksByElement, 'clicks', 'element'), {
        dimension: 'element',
        topN: TOP_N,
        rankBy: 'clicks',
      }),
      ...this.visitRows(visitStarts),
      // What time people browse, in the project's zone. It's 24 values: no
      // need to truncate.
      ...pageViewsByHour.map((row) => ({
        date: this.isoDay(row.day),
        metricKey: 'page_views',
        dimension: 'hour',
        dimValue: this.hourValue(row.hour),
        value: Number(row.total),
      })),
    );

    return rows;
  }

  private breakdown(
    project: RollupProject,
    from: IsoDate,
    to: IsoDate,
    type: 'PAGE_VIEW' | 'SITE_CLICK',
    column: 'target' | 'link_type' | 'path',
  ): Promise<DayDimCount[]> {
    const tz = project.timezone;
    const guardFrom = toUtcDate(addDays(from, -1));
    const guardTo = toUtcDate(addDays(to, 2));

    // `column` doesn't come from outside: it's three literals from this file.
    // It's interpolated because a column name can't be passed as a parameter.
    const dimension =
      column === 'target' ? 'target' : column === 'link_type' ? 'link_type' : 'path';

    return this.prisma.$queryRawUnsafe<DayDimCount[]>(
      `SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS day,
              ${dimension} AS dim_value,
              count(*) AS total
         FROM site_event
        WHERE project_id = $2
          AND type = $3::"SiteEventType"
          AND occurred_at >= $4 AND occurred_at < $5
          AND ${dimension} IS NOT NULL
          AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE $1)::date
              BETWEEN $6::date AND $7::date
        GROUP BY 1, 2`,
      tz,
      project.id,
      type,
      guardFrom,
      guardTo,
      toUtcDate(from),
      toUtcDate(to),
    );
  }

  /**
   * Clicks that say where they happened, by page or by element.
   *
   * Only counts the ones carrying section and label: a site click from an
   * older beacon version doesn't have them, and putting it in an empty bucket
   * would make the breakdown add up to less than the total without anyone
   * seeing why.
   */
  private async clickBreakdown(
    project: RollupProject,
    from: IsoDate,
    to: IsoDate,
    by: 'path' | 'element',
  ): Promise<DayDimCount[]> {
    const tz = project.timezone;
    const guardFrom = toUtcDate(addDays(from, -1));
    const guardTo = toUtcDate(addDays(to, 2));

    const rows = await this.prisma.$queryRaw<Array<DayDimCount & { section: string; label: string }>>`
      SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day,
             path AS dim_value, section, label,
             count(*) AS total
        FROM site_event
       WHERE project_id = ${project.id}
         AND type IN ('CLICK', 'SITE_CLICK')
         AND section IS NOT NULL AND label IS NOT NULL
         AND occurred_at >= ${guardFrom} AND occurred_at < ${guardTo}
         AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
             BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date
       GROUP BY 1, 2, 3, 4`;

    // Grouped here and not in SQL so that `elementKey`'s truncation is the
    // same everywhere: two labels that only differ past the cut must add up on
    // the same row, not collide on the natural key.
    const counts = new Map<string, DayDimCount>();
    for (const row of rows) {
      const value =
        by === 'path' ? row.dim_value : elementKey(row.dim_value ?? '', row.section, row.label);
      const key = `${this.isoDay(row.day)}\u0000${value}`;
      const bucket = counts.get(key);
      if (bucket) bucket.total += row.total;
      else counts.set(key, { day: row.day, dim_value: value, total: row.total });
    }
    return [...counts.values()];
  }

  /**
   * Each visit, counted once per day, with what it carried when it started.
   *
   * The origin only arrives on the landing page, so the session's first event
   * of the day is taken. That way every breakdown —country, channel, source,
   * hour— adds up to exactly the total visits.
   */
  private visitStarts(project: RollupProject, from: IsoDate, to: IsoDate): Promise<VisitStart[]> {
    const tz = project.timezone;
    const guardFrom = toUtcDate(addDays(from, -1));
    const guardTo = toUtcDate(addDays(to, 2));

    return this.prisma.$queryRaw<VisitStart[]>`
      SELECT DISTINCT ON (day, session_id)
             day, hour, country, referrer, utm_source, utm_medium, utm_campaign
        FROM (
          SELECT session_id, occurred_at, country, referrer, utm_source, utm_medium, utm_campaign,
                 (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day,
                 extract(hour FROM occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::int AS hour
            FROM site_event
           WHERE project_id = ${project.id}
             AND occurred_at >= ${guardFrom} AND occurred_at < ${guardTo}
        ) AS local
       WHERE day BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date
       ORDER BY day, session_id, occurred_at`;
  }

  private pageViewsByHour(project: RollupProject, from: IsoDate, to: IsoDate): Promise<DayHourCount[]> {
    const tz = project.timezone;
    const guardFrom = toUtcDate(addDays(from, -1));
    const guardTo = toUtcDate(addDays(to, 2));

    return this.prisma.$queryRaw<DayHourCount[]>`
      SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day,
             extract(hour FROM occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::int AS hour,
             count(*) AS total
        FROM site_event
       WHERE project_id = ${project.id}
         AND type = 'PAGE_VIEW'
         AND occurred_at >= ${guardFrom} AND occurred_at < ${guardTo}
         AND (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
             BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date
       GROUP BY 1, 2`;
  }

  /** Visits by country, channel, source, campaign and hour, from their start. */
  private visitRows(starts: VisitStart[]): MetricRow[] {
    const counts = new Map<string, MetricRow>();
    const add = (date: IsoDate, dimension: string, dimValue: string) => {
      const key = `${date}\u0000${dimension}\u0000${dimValue}`;
      const row = counts.get(key);
      if (row) row.value += 1;
      else counts.set(key, { date, metricKey: 'visits', dimension, dimValue, value: 1 });
    };

    for (const start of starts) {
      const date = this.isoDay(start.day);
      const origin = {
        referrer: start.referrer,
        utmSource: start.utm_source,
        utmMedium: start.utm_medium,
      };
      add(date, 'country', start.country ?? UNKNOWN);
      add(date, 'channel', channelOf(origin));
      add(date, 'source', sourceOf(origin).slice(0, 512));
      add(date, 'hour', this.hourValue(start.hour));
      // Only visits that came from a campaign: the rest don't have one.
      if (start.utm_campaign) add(date, 'campaign', start.utm_campaign);
    }

    const rows = [...counts.values()];
    const top = (dimension: string) =>
      collapseToTopN(
        rows.filter((r) => r.dimension === dimension),
        { dimension, topN: TOP_N, rankBy: 'visits' },
      );
    return [
      ...top('country'),
      ...top('channel'),
      ...top('source'),
      ...top('campaign'),
      ...rows.filter((r) => r.dimension === 'hour'),
    ];
  }

  /** `07` rather than `7`: sorted as text, the hours stay in order. */
  private hourValue(hour: number): string {
    return String(hour).padStart(2, '0');
  }

  private dimRows(counts: DayDimCount[], metricKey: string, dimension: string): MetricRow[] {
    return counts
      .filter((row) => row.dim_value !== null)
      .map((row) => ({
        date: this.isoDay(row.day),
        metricKey,
        dimension,
        dimValue: row.dim_value as string,
        value: Number(row.total),
      }));
  }

  private total(date: IsoDate, metricKey: string, value: bigint): MetricRow {
    return { date, metricKey, dimension: TOTAL_DIMENSION, dimValue: TOTAL, value: Number(value) };
  }

  /** Postgres returns a `date` as a Date at UTC midnight. */
  private isoDay(day: Date): IsoDate {
    return day.toISOString().slice(0, 10);
  }
}
