import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RunStatus, RunTrigger } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FactWriterService, type WriteResult } from './fact-writer.service';
import { addDays, todayIn, toUtcDate, type IsoDate } from './common/dates';
import { TOTAL, TOTAL_DIMENSION, type MetricRow } from './common/metric-row';
import { collapseToTopN } from './common/top-n';
import { MAX_EVENT_AGE_HOURS } from './site-events.contract';

/**
 * Las métricas que produce la consolidación, y de las que por tanto se hace
 * dueña: al reconsolidar una ventana borra las suyas de esos días y las vuelve
 * a escribir, sin tocar ninguna otra del proyecto.
 */
export const ROLLUP_METRIC_KEYS = ['visits', 'page_views', 'site_clicks'];

/**
 * Se reconsolidan siempre los últimos días, no solo el de ayer.
 *
 * Un evento puede llegar con retraso y la zona horaria del proyecto puede
 * moverse respecto a la del hub: rehacer cuatro días cuesta lo mismo y evita
 * que un día quede mal cuadrado para siempre.
 */
const ROLLUP_DAYS = 4;

/**
 * La consolidación en vivo solo rehace los días a los que puede caer un evento
 * recién llegado: hoy y los que cubre la antigüedad máxima que se acepta.
 */
const LIVE_DAYS = Math.ceil(MAX_EVENT_AGE_HOURS / 24) + 1;

/**
 * Espera tras el primer evento antes de consolidar. Agrupa la ráfaga de una
 * visita —la página, los clics— en una sola pasada en lugar de una por beacon,
 * y sigue siendo lo bastante corta para que el panel parezca en directo.
 */
const LIVE_DELAY_MS = 10_000;

/** Lo crudo se conserva lo justo para poder recalcular, no como archivo. */
const RETENTION_DAYS = 90;

/** Tope de valores con nombre propio por día y dimensión; el resto va a `__other__`. */
const TOP_N = 100;

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
}

interface DayDimCount {
  day: Date;
  dim_value: string | null;
  total: bigint;
}

/**
 * Convierte los eventos crudos en las mismas métricas diarias que envía
 * cualquier otro proyecto.
 *
 * Un sitio sin backend no puede agregar lo suyo, así que agrega el hub. Pero
 * el resultado entra por la misma puerta que todo lo demás —`metric_daily`,
 * medidas aditivas, desglose con `__other__`— para que el panel no tenga que
 * saber de dónde vino cada cifra.
 *
 * El día se decide aquí y en la zona horaria del proyecto: por eso el evento
 * se guarda con su instante en UTC y no con una fecha ya recortada. Si la zona
 * de un proyecto estaba mal puesta, se corrige y se vuelve a consolidar.
 */
@Injectable()
export class EventRollupService implements OnModuleDestroy {
  private readonly logger = new Logger(EventRollupService.name);

  /** Consolidaciones en vivo pendientes, una por proyecto. */
  private readonly pending = new Map<string, NodeJS.Timeout>();
  /** Proyectos que se están consolidando ahora, y si llegó algo mientras. */
  private readonly running = new Map<string, { dirty: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factWriter: FactWriterService,
  ) {}

  /**
   * De madrugada, después de la hora a la que empujan los proyectos con
   * backend propio y bastante antes de las 10:00, que es cuando el hub mira
   * quién no ha aparecido.
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
            `${project.slug}: ${result.rowsWritten} filas consolidadas desde eventos`,
          );
        }
      } catch (error) {
        // Un proyecto que falle no puede dejar sin consolidar a los demás.
        this.logger.error(
          `No se pudo consolidar ${project.slug}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  /**
   * Pide consolidar un proyecto porque acaban de llegarle eventos.
   *
   * Es lo que hace que el panel refleje las visitas según ocurren. No se
   * espera al resultado: quien envía no tiene por qué pagar la consolidación,
   * y si falla, el cron de la noche lo vuelve a intentar sobre lo mismo.
   *
   * Nunca hay dos a la vez para el mismo proyecto: lo que llegue durante una
   * consolidación deja marcada otra para cuando termine.
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
    // Un temporizador pendiente no debe impedir que el proceso se cierre.
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
        `No se pudo consolidar en vivo ${project.slug}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.running.delete(project.id);
      if (state.dirty) this.scheduleLive(project);
    }
  }

  /**
   * Consolida un proyecto. Devuelve `null` si no había ni un evento.
   *
   * El silencio no se escribe: un sitio sin eventos no es un sitio con cero
   * visitas —puede ser su cron de beacons roto, o que nadie haya entrado— y
   * escribir ceros haría indistinguibles las dos cosas. Sin filas no hay run,
   * y el proyecto aparece callado en Envíos, que es justo lo que pasa.
   */
  async rollup(project: RollupProject, days = ROLLUP_DAYS): Promise<WriteResult | null> {
    const to = todayIn(project.timezone);
    return this.rollupWindow(project, addDays(to, -(days - 1)), to);
  }

  /**
   * Consolida una ventana concreta. Sirve para rehacer un histórico —una zona
   * horaria mal puesta, un bot descubierto tarde— sin esperar al cron.
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
      // Cuenta como señal de vida igual que un envío: si el sitio deja de
      // mandar eventos, Envíos tiene que enterarse.
      this.prisma.project.update({
        where: { id: project.id },
        data: { lastPushAt: new Date() },
      }),
    ]);

    return result;
  }

  /**
   * El registro de la consolidación.
   *
   * La de la noche o la lanzada a mano deja uno nuevo cada vez. La de en vivo
   * reutiliza el de su ventana: la ventana cambia una vez al día, así que queda
   * uno por día y proyecto, en lugar de uno por visita enterrando en Envíos los
   * envíos de los demás.
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

  /** Borra lo crudo que ya no sirve para recalcular nada. */
  @Cron('0 30 3 * * *', { timeZone: 'America/La_Paz', name: 'event-retention' })
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.siteEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });

    if (count > 0) this.logger.log(`${count} eventos de más de ${RETENTION_DAYS} días borrados`);
  }

  /**
   * Las cuatro consultas que convierten eventos en filas.
   *
   * El día se calcula en SQL con `AT TIME ZONE 'UTC' AT TIME ZONE <zona>`
   * porque la columna es un timestamp sin zona que guarda UTC: el primer
   * AT TIME ZONE lo declara UTC y el segundo lo lleva a la zona del proyecto.
   * Con uno solo, el instante se interpretaría como hora local y los días
   * saldrían desplazados.
   *
   * El filtro por `occurred_at` en UTC no sobra aunque el de la fecha local ya
   * acote: es el único que puede usar el índice. El margen de un día por lado
   * cubre cualquier desfase de zona horaria.
   */
  private async aggregate(project: RollupProject, from: IsoDate, to: IsoDate): Promise<MetricRow[]> {
    const tz = project.timezone;
    const guardFrom = toUtcDate(addDays(from, -1));
    const guardTo = toUtcDate(addDays(to, 2));

    const totals = await this.prisma.$queryRaw<DayTotals[]>`
      SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day,
             count(DISTINCT session_id)                     AS visits,
             count(*) FILTER (WHERE type = 'PAGE_VIEW')     AS page_views,
             count(*) FILTER (WHERE type = 'SITE_CLICK')    AS site_clicks
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
      );
    }

    const byTarget = await this.breakdown(project, from, to, 'SITE_CLICK', 'target');
    const byLinkType = await this.breakdown(project, from, to, 'SITE_CLICK', 'link_type');
    const byPath = await this.breakdown(project, from, to, 'PAGE_VIEW', 'path');

    rows.push(
      // A qué sitio del grupo se va el clic: la razón de ser del portfolio.
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

    // `column` no viene de fuera: son tres literales de este archivo. Se
    // interpola porque un nombre de columna no puede ir como parámetro.
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

  /** Postgres devuelve un `date` como Date a medianoche UTC. */
  private isoDay(day: Date): IsoDate {
    return day.toISOString().slice(0, 10);
  }
}
