import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Aggregation, MetricUnit, RunStatus, RunTrigger } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FactWriterService, EmptyResultError } from './fact-writer.service';
import { collapseToTopN } from './common/top-n';
import { TOTAL, TOTAL_DIMENSION, type MetricRow } from './common/metric-row';
import { daysBetween, isIsoDate, type IsoDate } from './common/dates';
import { SCHEMA_VERSION, type InternalMetricsDto, type MetricDefinitionDto } from './contract';
import type { PushingProject } from './api-key.guard';

/** Maximum window per push. Anything larger should be split up. */
const MAX_WINDOW_DAYS = 92;
/** Cap on values per dimension and day: keeps a project from flooding the hub. */
const MAX_DIM_VALUES = 100;

/**
 * Reserved dimension: when an amount is broken down by it, each value IS a
 * currency code and takes precedence over the one declared in `definitions`.
 */
const CURRENCY_DIMENSION = 'currency';

const UNIT: Record<string, MetricUnit> = {
  count: MetricUnit.COUNT,
  currency: MetricUnit.CURRENCY,
  seconds: MetricUnit.SECONDS,
  ratio: MetricUnit.RATIO,
};

const AGGREGATION: Record<string, Aggregation> = {
  sum: Aggregation.SUM,
  last: Aggregation.LAST,
  max: Aggregation.MAX,
};

export interface PushResult {
  runId: string;
  status: RunStatus;
  rowsWritten: number;
  rowsDeleted: number;
  warnings: string[];
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factWriter: FactWriterService,
  ) {}

  async receive(
    project: PushingProject,
    payload: InternalMetricsDto,
    trigger: RunTrigger,
  ): Promise<PushResult> {
    const startedAt = Date.now();
    const warnings: string[] = [];

    if (payload.schemaVersion !== SCHEMA_VERSION) {
      throw new BadRequestException(
        `schemaVersion ${payload.schemaVersion}: el hub entiende la ${SCHEMA_VERSION}`,
      );
    }

    const { from, to } = this.resolveWindow(payload);

    // A timezone mismatch shifts the series by a day against the other sites
    // and nobody notices until someone compares them. It doesn't invalidate
    // the push, but it has to be recorded.
    if (payload.timezone !== project.timezone) {
      warnings.push(
        `El envío declara la zona ${payload.timezone} y el proyecto tiene ${project.timezone}`,
      );
    }

    await this.registerUnknownMetrics(payload.definitions);
    const rows = this.toRows(payload, from, to, warnings);

    const run = await this.prisma.ingestionRun.create({
      data: {
        projectId: project.id,
        trigger,
        status: RunStatus.SUCCESS,
        windowFrom: new Date(`${from}T00:00:00.000Z`),
        windowTo: new Date(`${to}T00:00:00.000Z`),
      },
    });

    try {
      const written = await this.factWriter.write({
        projectId: project.id,
        runId: run.id,
        from,
        to,
        rows,
      });

      const status = warnings.length > 0 ? RunStatus.PARTIAL : RunStatus.SUCCESS;

      await this.prisma.$transaction([
        this.prisma.ingestionRun.update({
          where: { id: run.id },
          data: {
            status,
            rowsWritten: written.rowsWritten,
            rowsDeleted: written.rowsDeleted,
            durationMs: Date.now() - startedAt,
            warnings: warnings.length ? warnings : undefined,
          },
        }),
        // The freshness mark only moves forward if the push was accepted: that
        // is what lets us detect that a project has gone quiet for days.
        this.prisma.project.update({
          where: { id: project.id },
          data: { lastPushAt: new Date() },
        }),
      ]);

      return { runId: run.id, status, ...written, warnings };
    } catch (error) {
      const empty = error instanceof EmptyResultError;
      await this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: RunStatus.REJECTED,
          errorCode: empty ? 'EMPTY_RESULT' : 'UNKNOWN',
          errorMessage: error instanceof Error ? error.message.slice(0, 2000) : String(error),
          durationMs: Date.now() - startedAt,
        },
      });

      if (empty) {
        throw new BadRequestException(
          'El envío no traía filas para una ventana que ya tenía datos. No se ha borrado nada: ' +
            'si de verdad no hubo actividad, envía los días con valores a cero.',
        );
      }
      throw error;
    }
  }

  /**
   * The window the push declares, or the one its days span.
   *
   * It matters because the hub REPLACES that range: whatever the project
   * doesn't send again inside it gets deleted. Without an explicit window, a
   * partial push could wipe out good data for the days it didn't mention.
   */
  private resolveWindow(payload: InternalMetricsDto): { from: IsoDate; to: IsoDate } {
    const declared = payload.range;

    if (declared?.from && declared?.to) {
      if (!isIsoDate(declared.from) || !isIsoDate(declared.to)) {
        throw new BadRequestException('`range.from` y `range.to` deben ser fechas reales');
      }
      if (declared.from > declared.to) {
        throw new BadRequestException('`range.from` no puede ser posterior a `range.to`');
      }
      if (daysBetween(declared.from, declared.to) + 1 > MAX_WINDOW_DAYS) {
        throw new BadRequestException(`La ventana máxima por envío es de ${MAX_WINDOW_DAYS} días`);
      }
      return { from: declared.from, to: declared.to };
    }

    if (payload.days.length === 0) {
      throw new BadRequestException(
        'Un envío sin días debe declarar `range`, o el hub no sabe qué periodo reemplazar',
      );
    }

    const dates = payload.days.map((d) => d.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }

  /**
   * A metric the hub doesn't know is registered as inactive: it's stored all
   * the same —the data isn't lost— but it isn't shown until someone decides
   * what it's called and how it's formatted.
   */
  private async registerUnknownMetrics(definitions: MetricDefinitionDto[]): Promise<void> {
    const known = new Set(
      (await this.prisma.metricDefinition.findMany({ select: { key: true } })).map((d) => d.key),
    );
    const newDefinitions = definitions.filter((d) => !known.has(d.key));
    if (newDefinitions.length === 0) return;

    await this.prisma.metricDefinition.createMany({
      data: newDefinitions.map((d) => ({
        key: d.key,
        label: d.label,
        unit: UNIT[d.unit],
        aggregation: AGGREGATION[d.aggregation ?? 'sum'],
        active: false,
        sortOrder: 900,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`New metrics (inactive until reviewed): ${newDefinitions.map((d) => d.key).join(', ')}`);
  }

  /** Mechanical mapping from the JSON to the fact model. No special cases. */
  private toRows(
    payload: InternalMetricsDto,
    from: IsoDate,
    to: IsoDate,
    warnings: string[],
  ): MetricRow[] {
    const currencies = new Map(
      payload.definitions.filter((d) => d.unit === 'currency').map((d) => [d.key, d.currency]),
    );
    const declared = new Set(payload.definitions.map((d) => d.key));
    const undeclared = new Set<string>();
    const outOfWindow = new Set<string>();

    const totals: MetricRow[] = [];
    const breakdowns: MetricRow[] = [];

    for (const day of payload.days) {
      // A day outside the declared window is discarded: the replacement only
      // covers the window, so it would stay written forever without anyone
      // ever touching it again.
      if (day.date < from || day.date > to) {
        outOfWindow.add(day.date);
        continue;
      }

      for (const [metricKey, value] of Object.entries(day.metrics)) {
        if (!Number.isFinite(value)) continue;
        if (!declared.has(metricKey)) undeclared.add(metricKey);

        totals.push({
          date: day.date,
          metricKey,
          dimension: TOTAL_DIMENSION,
          dimValue: TOTAL,
          value,
          currency: currencies.get(metricKey) ?? undefined,
        });
      }

      for (const breakdown of day.breakdowns ?? []) {
        for (const [dimValue, value] of Object.entries(breakdown.values)) {
          if (!Number.isFinite(value)) continue;

          breakdowns.push({
            date: day.date,
            metricKey: breakdown.metric,
            dimension: breakdown.dimension,
            dimValue,
            value,
            // A breakdown BY currency carries the currency in the dimension
            // value itself. Without this, a project that bills in two
            // currencies —take charges in USD and CUP— would see its peso
            // amounts labelled as dollars, and nobody would notice until adding up.
            currency:
              breakdown.dimension === CURRENCY_DIMENSION
                ? dimValue
                : (currencies.get(breakdown.metric) ?? undefined),
          });
        }
      }
    }

    // Trimmed here rather than trusting the project to do it: a breakdown by
    // path or by query can bring thousands of values per day. The rest is
    // summed into `__other__`, so the breakdown still adds up.
    const trimmed: MetricRow[] = [];
    for (const dimension of new Set(breakdowns.map((r) => r.dimension))) {
      const ofDimension = breakdowns.filter((r) => r.dimension === dimension);
      const rankBy = ofDimension[0].metricKey;
      const before = new Set(ofDimension.map((r) => `${r.date}|${r.dimValue}`)).size;

      const collapsed = collapseToTopN(ofDimension, { dimension, topN: MAX_DIM_VALUES, rankBy });
      const after = new Set(collapsed.map((r) => `${r.date}|${r.dimValue}`)).size;

      if (after < before) {
        warnings.push(`El desglose "${dimension}" se recortó al top ${MAX_DIM_VALUES} por día`);
      }
      trimmed.push(...collapsed);
    }

    // An amount without a currency can't be aggregated or compared: either
    // it's declared in `definitions`, or it comes broken down by `currency`.
    const brokenDownByCurrency = new Set(
      breakdowns.filter((r) => r.dimension === CURRENCY_DIMENSION).map((r) => r.metricKey),
    );
    for (const def of payload.definitions) {
      if (def.unit !== 'currency') continue;
      if (def.currency || brokenDownByCurrency.has(def.key)) continue;
      warnings.push(
        `La métrica de importe "${def.key}" no declara moneda ni viene desglosada por \`currency\``,
      );
    }

    if (undeclared.size > 0) {
      warnings.push(`Métricas enviadas sin declarar en \`definitions\`: ${[...undeclared].join(', ')}`);
    }
    if (outOfWindow.size > 0) {
      warnings.push(`Días fuera de la ventana declarada, descartados: ${[...outOfWindow].join(', ')}`);
    }

    return [...totals, ...trimmed];
  }
}
