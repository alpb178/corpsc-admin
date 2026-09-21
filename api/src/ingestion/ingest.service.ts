import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Aggregation, MetricUnit, RunStatus, RunTrigger } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FactWriterService, EmptyResultError } from './fact-writer.service';
import { collapseToTopN } from './common/top-n';
import { TOTAL, TOTAL_DIMENSION, type MetricRow } from './common/metric-row';
import { daysBetween, isIsoDate, type IsoDate } from './common/dates';
import { SCHEMA_VERSION, type InternalMetricsDto, type MetricDefinitionDto } from './contract';
import type { PushingProject } from './api-key.guard';

/** Ventana máxima por envío. Más que esto y conviene trocearlo. */
const MAX_WINDOW_DAYS = 92;
/** Tope de valores por dimensión y día: evita que un proyecto inunde el hub. */
const MAX_DIM_VALUES = 100;

/**
 * Dimensión reservada: cuando un importe se desglosa por ella, cada valor ES
 * un código de moneda y manda sobre la declarada en `definitions`.
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

    // Un desajuste horario desplaza las series un día frente a las de otros
    // sitios y no se nota hasta que alguien compara. No invalida el envío,
    // pero tiene que quedar registrado.
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
        // La marca de frescura solo avanza si el envío se aceptó: es lo que
        // permite detectar que un proyecto lleva días callado.
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
   * La ventana que el envío declara, o la que abarcan sus días.
   *
   * Importa porque el hub REEMPLAZA ese rango: lo que el proyecto no vuelva a
   * mandar dentro de él se borra. Sin ventana explícita, un envío parcial
   * podría llevarse por delante datos buenos de los días que no mencionó.
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
   * Una métrica que el hub no conoce se registra desactivada: se guarda igual
   * —el dato no se pierde— pero no se muestra hasta que alguien decida cómo
   * se llama y cómo se formatea.
   */
  private async registerUnknownMetrics(definitions: MetricDefinitionDto[]): Promise<void> {
    const known = new Set(
      (await this.prisma.metricDefinition.findMany({ select: { key: true } })).map((d) => d.key),
    );
    const nuevas = definitions.filter((d) => !known.has(d.key));
    if (nuevas.length === 0) return;

    await this.prisma.metricDefinition.createMany({
      data: nuevas.map((d) => ({
        key: d.key,
        label: d.label,
        unit: UNIT[d.unit],
        aggregation: AGGREGATION[d.aggregation ?? 'sum'],
        active: false,
        sortOrder: 900,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Métricas nuevas (inactivas hasta revisarlas): ${nuevas.map((d) => d.key).join(', ')}`);
  }

  /** Mapeo mecánico del JSON al modelo de hechos. Sin casos especiales. */
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
    const sinDeclarar = new Set<string>();
    const fuera = new Set<string>();

    const totals: MetricRow[] = [];
    const breakdowns: MetricRow[] = [];

    for (const day of payload.days) {
      // Un día fuera de la ventana declarada se descarta: el reemplazo solo
      // cubre la ventana, así que quedaría escrito para siempre sin que nadie
      // lo volviera a tocar.
      if (day.date < from || day.date > to) {
        fuera.add(day.date);
        continue;
      }

      for (const [metricKey, value] of Object.entries(day.metrics)) {
        if (!Number.isFinite(value)) continue;
        if (!declared.has(metricKey)) sinDeclarar.add(metricKey);

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
            // Un desglose POR moneda lleva la moneda en el propio valor de la
            // dimensión. Sin esto, un proyecto que factura en dos monedas
            // —take cobra en USD y en CUP— vería sus importes en pesos
            // etiquetados como dólares, y nadie lo notaría hasta sumar.
            currency:
              breakdown.dimension === CURRENCY_DIMENSION
                ? dimValue
                : (currencies.get(breakdown.metric) ?? undefined),
          });
        }
      }
    }

    // Se recorta aquí y no se confía en que el proyecto lo haga: un desglose
    // por ruta o por consulta puede traer miles de valores por día. El resto
    // se suma en `__other__`, de modo que el desglose siga cuadrando.
    const recortados: MetricRow[] = [];
    for (const dimension of new Set(breakdowns.map((r) => r.dimension))) {
      const delEje = breakdowns.filter((r) => r.dimension === dimension);
      const rankBy = delEje[0].metricKey;
      const antes = new Set(delEje.map((r) => `${r.date}|${r.dimValue}`)).size;

      const collapsed = collapseToTopN(delEje, { dimension, topN: MAX_DIM_VALUES, rankBy });
      const despues = new Set(collapsed.map((r) => `${r.date}|${r.dimValue}`)).size;

      if (despues < antes) {
        warnings.push(`El desglose "${dimension}" se recortó al top ${MAX_DIM_VALUES} por día`);
      }
      recortados.push(...collapsed);
    }

    // Un importe sin moneda no se puede agregar ni comparar: o se declara en
    // `definitions`, o viene desglosado por `currency`.
    const conDesgloseDeMoneda = new Set(
      breakdowns.filter((r) => r.dimension === CURRENCY_DIMENSION).map((r) => r.metricKey),
    );
    for (const def of payload.definitions) {
      if (def.unit !== 'currency') continue;
      if (def.currency || conDesgloseDeMoneda.has(def.key)) continue;
      warnings.push(
        `La métrica de importe "${def.key}" no declara moneda ni viene desglosada por \`currency\``,
      );
    }

    if (sinDeclarar.size > 0) {
      warnings.push(`Métricas enviadas sin declarar en \`definitions\`: ${[...sinDeclarar].join(', ')}`);
    }
    if (fuera.size > 0) {
      warnings.push(`Días fuera de la ventana declarada, descartados: ${[...fuera].join(', ')}`);
    }

    return [...totals, ...recortados];
  }
}
