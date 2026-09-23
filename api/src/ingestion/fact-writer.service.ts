import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toUtcDate, type IsoDate } from './common/dates';
import type { MetricRow } from './common/metric-row';

const BATCH_SIZE = 1_000;

export class EmptyResultError extends Error {
  readonly code = 'EMPTY_RESULT';
}

export interface WriteResult {
  rowsWritten: number;
  rowsDeleted: number;
}

export interface WriteParams {
  projectId: string;
  runId: string;
  from: IsoDate;
  to: IsoDate;
  rows: MetricRow[];
  /**
   * Metrics this writer takes ownership of within the window.
   *
   * Without this, orphan deletion clears the ENTIRE window, which is right for
   * a submission: the project sends everything it has for those days. The
   * event rollup, however, only produces visits and clicks, and without
   * scoping it would wipe out the project's other metrics.
   */
  ownedMetricKeys?: string[];
}

/**
 * Writes the facts of a window and leaves it EXACTLY as the project sent it.
 *
 * There are two steps and both are needed:
 *
 *  1. Upsert by the natural key, so reprocessing doesn't duplicate.
 *  2. Orphan deletion: the window's rows this run didn't write again. Without
 *     this step, a query that was in the top-100 yesterday and isn't today
 *     stays frozen with its old value, and the breakdown stops adding up to
 *     the total forever.
 *
 * Step 2 is also the most dangerous one in the system, hence the
 * `rows.length === 0` safeguard.
 */
@Injectable()
export class FactWriterService {
  private readonly logger = new Logger(FactWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(params: WriteParams): Promise<WriteResult> {
    const { projectId, runId, from, to, rows, ownedMetricKeys } = params;

    // Safeguard against silent data collapse.
    //
    // A broken query in the project, or a half-finished deploy, produces an
    // empty submission. If we went ahead, orphan deletion would wipe out good
    // data and the failure would only be noticed weeks later, looking at a
    // chart with a hole in it. When in doubt, nothing is touched.
    if (rows.length === 0) {
      const existing = await this.prisma.metricDaily.count({
        where: {
          projectId,
          date: { gte: toUtcDate(from), lte: toUtcDate(to) },
          ...(ownedMetricKeys ? { metricKey: { in: ownedMetricKeys } } : {}),
        },
      });

      if (existing > 0) {
        throw new EmptyResultError(
          `El envío no traía filas para ${from}…${to} pero ya había ${existing} en la base. ` +
            'No se ha borrado nada: si de verdad no hubo actividad, manda los días a cero.',
        );
      }

      this.logger.debug(`No data for ${from}…${to} (the window was empty too)`);
      return { rowsWritten: 0, rowsDeleted: 0 };
    }

    // Start mark: the window's rows with an earlier `ingested_at` are exactly
    // the ones this run didn't write again.
    const startedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      let rowsWritten = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        rowsWritten += await this.upsertBatch(
          tx,
          projectId,
          runId,
          startedAt,
          rows.slice(i, i + BATCH_SIZE),
        );
      }

      const rowsDeleted = ownedMetricKeys
        ? await tx.$executeRaw`
            DELETE FROM metric_daily
             WHERE project_id = ${projectId}
               AND date BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date
               AND metric_key = ANY(${ownedMetricKeys}::varchar[])
               AND ingested_at < ${startedAt}`
        : await tx.$executeRaw`
            DELETE FROM metric_daily
             WHERE project_id = ${projectId}
               AND date BETWEEN ${toUtcDate(from)}::date AND ${toUtcDate(to)}::date
               AND ingested_at < ${startedAt}`;

      return { rowsWritten, rowsDeleted };
    });
  }

  /**
   * A single INSERT per batch instead of N Prisma `upsert()` calls: a full
   * night is ~17,000 rows, and one round trip per row would make ingestion
   * take minutes instead of seconds.
   */
  private upsertBatch(
    tx: Prisma.TransactionClient,
    projectId: string,
    runId: string,
    ingestedAt: Date,
    rows: MetricRow[],
  ): Promise<number> {
    const dates = rows.map((r) => toUtcDate(r.date));
    const metricKeys = rows.map((r) => r.metricKey);
    const dimensions = rows.map((r) => r.dimension);
    const dimValues = rows.map((r) => r.dimValue.slice(0, 512));
    const values = rows.map((r) => r.value);
    const currencies = rows.map((r) => r.currency ?? null);

    return tx.$executeRaw`
      INSERT INTO metric_daily
        (project_id, date, metric_key, dimension, dim_value,
         value, currency, run_id, ingested_at)
      SELECT ${projectId}, d, k, dim, dv, v, c, ${runId}, ${ingestedAt}
        FROM UNNEST(
               ${dates}::date[],
               ${metricKeys}::varchar[],
               ${dimensions}::varchar[],
               ${dimValues}::varchar[],
               ${values}::numeric[],
               ${currencies}::varchar[]
             ) AS t(d, k, dim, dv, v, c)
      ON CONFLICT (project_id, date, metric_key, dimension, dim_value)
      DO UPDATE SET value       = EXCLUDED.value,
                    currency    = EXCLUDED.currency,
                    run_id      = EXCLUDED.run_id,
                    ingested_at = EXCLUDED.ingested_at`;
  }
}
