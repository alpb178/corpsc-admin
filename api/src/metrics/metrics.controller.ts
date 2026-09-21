import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { RangeDto, CompareDto } from './dto/range.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FreshnessService } from '../ingestion/freshness.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
// Sin @Roles: leer métricas es lo que puede hacer cualquier rol, incluido VIEWER.
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly freshness: FreshnessService,
  ) {}

  @Get('freshness')
  @ApiOperation({
    summary: 'Qué proyectos han enviado y cuándo',
    description:
      'Es la contrapartida de recibir en vez de ir a buscar: si el cron de un ' +
      'proyecto se rompe, no falla nada visible — simplemente dejan de llegar datos.',
  })
  freshnessReport() {
    return this.freshness.report();
  }

  @Get('runs')
  @ApiOperation({ summary: 'Últimos envíos recibidos, con sus avisos' })
  runs() {
    return this.prisma.ingestionRun.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50,
      include: { project: { select: { slug: true, name: true } } },
    });
  }

  @Get('definitions')
  @ApiOperation({ summary: 'Catálogo de métricas, con unidad y cuáles son derivadas' })
  definitions() {
    return this.prisma.metricDefinition.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('overview')
  @ApiOperation({ summary: 'KPIs del grupo, reparto propio/cliente y tabla por sitio' })
  overview(@Query() q: RangeDto) {
    return this.metrics.overview({ from: q.from, to: q.to }, q.compare ?? false);
  }


  @Get('compare')
  @ApiOperation({ summary: 'Una métrica, varios sitios, serie diaria' })
  compare(@Query() q: CompareDto) {
    const slugs = q.slugs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.metrics.compareProjects(slugs, q.metric ?? 'visits', { from: q.from, to: q.to });
  }

  @Get('projects/:slug')
  @ApiOperation({ summary: 'Ficha de un sitio: totales, serie diaria, desgloses y SEO' })
  project(@Param('slug') slug: string, @Query() q: RangeDto) {
    return this.metrics.project(slug, { from: q.from, to: q.to }, q.compare ?? false);
  }
}
