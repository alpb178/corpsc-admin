import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MetricUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FreshnessService } from '../ingestion/freshness.service';
import { compare, isImprovement, withDerived, type MetricMeta, type MetricTotals } from './derived';
import { addDays, daysBetween, isIsoDate, toUtcDate, type IsoDate } from '../ingestion/common/dates';
import { TOTAL_DIMENSION } from '../ingestion/common/metric-row';

export interface Range {
  from: IsoDate;
  to: IsoDate;
}

export interface ProjectSummary {
  slug: string;
  name: string;
  kind: string;
  domain: string;
  metrics: MetricTotals;
}

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshness: FreshnessService,
  ) {}

  // ─────────────────────────── Group view ───────────────────────────

  async overview(range: Range, withComparison: boolean) {
    this.assertRange(range);
    const definitions = await this.definitions();

    const [totals, byProject, series] = await Promise.all([
      this.sumTotals(range),
      this.sumTotalsByProject(range),
      this.dailySeries(range),
    ]);

    const current = withDerived(totals, definitions);
    const projects = await this.decorateProjects(byProject, definitions);

    // Own versus client: it's the business question that separates "how is
    // the product doing" from "how is the service doing".
    const split = { own: {} as MetricTotals, client: {} as MetricTotals };
    for (const p of projects) {
      const bucket = p.kind === 'OWN' ? split.own : split.client;
      for (const [key, value] of Object.entries(p.metrics)) {
        if (definitions.find((d) => d.key === key)?.derivedFrom) continue; // ratios aren't summed
        bucket[key] = (bucket[key] ?? 0) + value;
      }
    }

    const result: Record<string, unknown> = {
      range,
      totals: current,
      split: { own: withDerived(split.own, definitions), client: withDerived(split.client, definitions) },
      series,
      projects,
    };

    if (withComparison) {
      const previous = this.previousRange(range);
      const deltas = compare(current, withDerived(await this.sumTotals(previous), definitions));
      result.comparison = {
        range: previous,
        deltas: Object.fromEntries(
          Object.entries(deltas).map(([key, d]) => [key, { ...d, improved: isImprovement(key, d.change) }]),
        ),
      };
    }

    return result;
  }

  // ─────────────────────────── Site detail ───────────────────────────

  async project(slug: string, range: Range, withComparison: boolean) {
    this.assertRange(range);

    const project = await this.prisma.project.findUnique({ where: { slug } });
    if (!project) throw new NotFoundException(`No existe el proyecto "${slug}"`);

    const definitions = await this.definitions();

    const [totals, series, country, device, paths, elements, channel, source, campaign, hour] =
      await Promise.all([
      this.sumTotals(range, project.id),
      this.dailySeries(range, project.id),
      this.breakdown(range, project.id, 'country', 'visits'),
      this.breakdown(range, project.id, 'device', 'visits'),
      // Pages also carry their clicks: they share the `path` dimension.
      this.breakdown(range, project.id, 'path', 'page_views', 50),
      // Where clicks happen: "path | section | label", already sorted by clicks.
      this.breakdown(range, project.id, 'element', 'clicks', 100),
      this.breakdown(range, project.id, 'channel', 'visits'),
      this.breakdown(range, project.id, 'source', 'visits'),
      this.breakdown(range, project.id, 'campaign', 'visits'),
      // All 24 hours, with visits and page views; the panel sorts them.
      this.breakdown(range, project.id, 'hour', 'visits', 24),
    ]);

    const current = withDerived(totals, definitions);

    const result: Record<string, unknown> = {
      project: {
        slug: project.slug,
        name: project.name,
        domain: project.domain,
        kind: project.kind,
        timezone: project.timezone,
        lastPushAt: project.lastPushAt,
        // Classified on the server: the browser's clock may be wrong.
        ...this.freshness.classify(project.lastPushAt),
      },
      range,
      totals: current,
      series,
      breakdowns: { country, device, path: paths, element: elements, channel, source, campaign, hour },
    };

    if (withComparison) {
      const previous = this.previousRange(range);
      const deltas = compare(
        current,
        withDerived(await this.sumTotals(previous, project.id), definitions),
      );
      result.comparison = {
        range: previous,
        deltas: Object.fromEntries(
          Object.entries(deltas).map(([key, d]) => [key, { ...d, improved: isImprovement(key, d.change) }]),
        ),
      };
    }

    return result;
  }

  // ─────────────────────────── Comparison ───────────────────────────

  async compareProjects(slugs: string[], metricKey: string, range: Range) {
    this.assertRange(range);
    if (slugs.length === 0) throw new BadRequestException('Indica al menos un sitio');
    if (slugs.length > 14) throw new BadRequestException('Como mucho 14 sitios');

    const definition = await this.prisma.metricDefinition.findUnique({ where: { key: metricKey } });
    if (!definition) throw new BadRequestException(`Métrica desconocida: "${metricKey}"`);
    if (definition.derivedFrom) {
      throw new BadRequestException(
        `"${metricKey}" es una métrica derivada y no tiene serie propia. ` +
          'Compara sus componentes o usa la ficha del proyecto.',
      );
    }

    const projects = await this.prisma.project.findMany({ where: { slug: { in: slugs } } });
    const missing = slugs.filter((s) => !projects.some((p) => p.slug === s));
    if (missing.length) throw new NotFoundException(`No existen: ${missing.join(', ')}`);

    this.assertSingleCurrency(definition.unit, projects);

    const rows = await this.prisma.metricDaily.groupBy({
      by: ['projectId', 'date'],
      where: {
        projectId: { in: projects.map((p) => p.id) },
        metricKey,
        dimension: TOTAL_DIMENSION,
        date: { gte: toUtcDate(range.from), lte: toUtcDate(range.to) },
      },
      _sum: { value: true },
      orderBy: { date: 'asc' },
    });

    return {
      range,
      metric: { key: definition.key, label: definition.label, unit: definition.unit },
      series: projects.map((p) => ({
        slug: p.slug,
        name: p.name,
        points: rows
          .filter((r) => r.projectId === p.id)
          .map((r) => ({ date: iso(r.date), value: num(r._sum.value) })),
      })),
    };
  }


  // ─────────────────────────── Base queries ───────────────────────────

  private async sumTotals(range: Range, projectId?: string): Promise<MetricTotals> {
    const rows = await this.prisma.metricDaily.groupBy({
      by: ['metricKey'],
      where: {
        ...(projectId ? { projectId } : {}),
        dimension: TOTAL_DIMENSION,
        date: { gte: toUtcDate(range.from), lte: toUtcDate(range.to) },
      },
      _sum: { value: true },
    });

    return Object.fromEntries(rows.map((r) => [r.metricKey, num(r._sum.value)]));
  }

  private async sumTotalsByProject(range: Range) {
    return this.prisma.metricDaily.groupBy({
      by: ['projectId', 'metricKey'],
      where: {
        dimension: TOTAL_DIMENSION,
        date: { gte: toUtcDate(range.from), lte: toUtcDate(range.to) },
      },
      _sum: { value: true },
    });
  }

  /** Daily series for a project, or for the whole group if none is given. */
  private async dailySeries(range: Range, projectId?: string) {
    const rows = await this.prisma.metricDaily.groupBy({
      by: ['date', 'metricKey'],
      where: {
        ...(projectId ? { projectId } : {}),
        dimension: TOTAL_DIMENSION,
        date: { gte: toUtcDate(range.from), lte: toUtcDate(range.to) },
      },
      _sum: { value: true },
      orderBy: { date: 'asc' },
    });

    const byDate = new Map<string, MetricTotals>();
    for (const row of rows) {
      const date = iso(row.date);
      const bucket = byDate.get(date) ?? {};
      bucket[row.metricKey] = num(row._sum.value);
      byDate.set(date, bucket);
    }

    // Days without data are filled with an explicit gap: a chart that joins
    // day 3 to day 7 with a straight line suggests a trend that never
    // happened.
    const out: Array<{ date: string; metrics: MetricTotals }> = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      out.push({ date: d, metrics: byDate.get(d) ?? {} });
    }
    return out;
  }

  private async breakdown(range: Range, projectId: string, dimension: string, rankBy: string, limit = 20) {
    const rows = await this.prisma.metricDaily.groupBy({
      by: ['dimValue', 'metricKey'],
      where: {
        projectId,
        dimension,
        date: { gte: toUtcDate(range.from), lte: toUtcDate(range.to) },
      },
      _sum: { value: true },
    });

    const byValue = new Map<string, MetricTotals>();
    for (const row of rows) {
      const bucket = byValue.get(row.dimValue) ?? {};
      bucket[row.metricKey] = num(row._sum.value);
      byValue.set(row.dimValue, bucket);
    }

    const definitions = await this.definitions();

    return [...byValue.entries()]
      .map(([value, metrics]) => ({ value, metrics: withDerived(metrics, definitions) }))
      .sort((a, b) => (b.metrics[rankBy] ?? 0) - (a.metrics[rankBy] ?? 0))
      .slice(0, limit);
  }

  private async decorateProjects(
    rows: Array<{ projectId: string; metricKey: string; _sum: { value: Prisma.Decimal | null } }>,
    definitions: MetricMeta[],
  ): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }],
    });

    return projects.map((p) => {
      const totals: MetricTotals = {};
      for (const row of rows) {
        if (row.projectId === p.id) totals[row.metricKey] = num(row._sum.value);
      }
      return {
        slug: p.slug,
        name: p.name,
        kind: p.kind,
        domain: p.domain,
        metrics: withDerived(totals, definitions),
      };
    });
  }

  private async definitions(): Promise<MetricMeta[]> {
    const rows = await this.prisma.metricDefinition.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      unit: r.unit,
      aggregation: r.aggregation,
      derivedFrom: r.derivedFrom as MetricMeta['derivedFrom'],
    }));
  }

  // ─────────────────────────── Safeguards ───────────────────────────

  private assertRange(range: Range): void {
    if (!isIsoDate(range.from) || !isIsoDate(range.to)) {
      throw new BadRequestException('Las fechas deben existir en el calendario');
    }
    if (range.from > range.to) {
      throw new BadRequestException('`from` no puede ser posterior a `to`');
    }
  }

  /**
   * Prevents summing money in different currencies.
   *
   * Take bills in USD and CUP, Iris in BOB, Invoices in EUR/USD. A
   * `SUM(revenue)` across those projects gives a meaningless number that
   * would end up on a slide. Better to fail here than to produce it.
   */
  private assertSingleCurrency(unit: MetricUnit, projects: Array<{ currency: string | null }>): void {
    if (unit !== MetricUnit.CURRENCY) return;

    const currencies = new Set(projects.map((p) => p.currency).filter(Boolean));
    if (currencies.size > 1) {
      throw new BadRequestException(
        `No se pueden agregar importes en monedas distintas (${[...currencies].join(', ')}). ` +
          'Compara los sitios por separado: la conversión de divisa está fuera de alcance.',
      );
    }
  }

  /** Previous period of the same length, right before the current one. */
  previousRange(range: Range): Range {
    const span = daysBetween(range.from, range.to) + 1;
    return { from: addDays(range.from, -span), to: addDays(range.from, -1) };
  }
}

/** Prisma returns Decimals as objects; the JSON must carry numbers. */
function num(value: Prisma.Decimal | null): number {
  return value ? Number(value) : 0;
}

function iso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}
