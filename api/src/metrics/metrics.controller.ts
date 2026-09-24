import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { RangeDto, CompareDto, RealtimeQueryDto, VisitorsQueryDto } from './dto/range.dto';
import { RealtimeService } from './realtime.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FreshnessService } from '../ingestion/freshness.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
// No @Roles: reading metrics is something any role can do, VIEWER included.
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly freshness: FreshnessService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('freshness')
  @ApiOperation({
    summary: 'Which projects have sent data and when',
    description:
      "The flip side of receiving instead of fetching: if a project's cron " +
      'breaks, nothing visibly fails — data simply stops arriving.',
  })
  freshnessReport() {
    return this.freshness.report();
  }

  @Get('runs')
  @ApiOperation({ summary: 'Latest submissions received, with their warnings' })
  runs() {
    return this.prisma.ingestionRun.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50,
      include: { project: { select: { slug: true, name: true } } },
    });
  }

  @Get('definitions')
  @ApiOperation({ summary: 'Metric catalog, with units and which ones are derived' })
  definitions() {
    return this.prisma.metricDefinition.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('overview')
  @ApiOperation({ summary: 'Group KPIs, own/client split and per-site table' })
  overview(@Query() q: RangeDto) {
    return this.metrics.overview({ from: q.from, to: q.to }, q.compare ?? false);
  }


  @Get('compare')
  @ApiOperation({ summary: 'One metric, several sites, daily series' })
  compare(@Query() q: CompareDto) {
    const slugs = q.slugs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.metrics.compareProjects(slugs, q.metric ?? 'visits', { from: q.from, to: q.to });
  }

  @Get('visitors')
  @ApiOperation({
    summary: 'Unique, new and returning visitors in a range, for one site or the group',
    description:
      'Counted at read time: unique visitors cannot be summed day by day. Only v2 beacons ' +
      'identify visitors; `since` says from which day there is data.',
  })
  visitors(@Query() q: VisitorsQueryDto) {
    return this.metrics.visitors({ from: q.from, to: q.to }, q.project);
  }

  @Get('realtime')
  @ApiOperation({ summary: 'Active visitors and latest events, straight from the raw events' })
  realtimeSnapshot(@Query() q: RealtimeQueryDto) {
    return this.realtime.snapshot(q.project, q.minutes);
  }

  @Get('projects/:slug')
  @ApiOperation({ summary: 'Site detail: totals, daily series, breakdowns and SEO' })
  project(@Param('slug') slug: string, @Query() q: RangeDto) {
    return this.metrics.project(slug, { from: q.from, to: q.to }, q.compare ?? false);
  }
}
