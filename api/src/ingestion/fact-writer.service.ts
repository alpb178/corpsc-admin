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
   * Métricas de las que este escritor se hace dueño dentro de la ventana.
   *
   * Sin esto, el borrado de huérfanos limpia la ventana ENTERA, que es lo
   * correcto para un envío: el proyecto manda todo lo suyo de esos días. La
   * consolidación de eventos, en cambio, solo produce visitas y clics, y sin
   * acotar se llevaría por delante las demás métricas del mismo proyecto.
   */
  ownedMetricKeys?: string[];
}

/**
 * Escribe los hechos de una ventana y la deja EXACTAMENTE como la envió el
 * proyecto.
 *
 * Son dos pasos y los dos hacen falta:
 *
 *  1. Upsert por la clave natural, para que reprocesar no duplique.
 *  2. Borrado de huérfanos: las filas de la ventana que este run no ha vuelto a
 *     escribir. Sin este paso, una consulta que ayer estaba en el top-100 y hoy
 *     no, se queda congelada con su valor viejo, y el desglose deja de sumar el
 *     total para siempre.
 *
 * El paso 2 es también el más peligroso del sistema, de ahí la salvaguarda de
 * `rows.length === 0`.
 */
@Injectable()
export class FactWriterService {
  private readonly logger = new Logger(FactWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(params: WriteParams): Promise<WriteResult> {
    const { projectId, runId, from, to, rows, ownedMetricKeys } = params;

    // Salvaguarda contra el colapso silencioso de datos.
    //
    // Una consulta rota en el proyecto, o un despliegue a medias, devuelve un
    // envío vacío. Si siguiéramos adelante, el borrado de huérfanos se llevaría
    // por delante datos buenos y el fallo solo se notaría semanas después, al
    // mirar una gráfica con un agujero. Ante la duda, no se toca nada.
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

      this.logger.debug(`Sin datos para ${from}…${to} (la ventana también estaba vacía)`);
      return { rowsWritten: 0, rowsDeleted: 0 };
    }

    // Marca de inicio: las filas de la ventana con `ingested_at` anterior son
    // justo las que este run no ha vuelto a escribir.
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
   * Un único INSERT por lote en lugar de N `upsert()` de Prisma: una noche
   * completa son ~17.000 filas, y una ida y vuelta por fila haría que la
   * ingesta durase minutos en lugar de segundos.
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
