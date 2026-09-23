import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RunTrigger } from '@prisma/client';
import { ApiKeyGuard, CurrentProject, type PushingProject } from './api-key.guard';
import { IngestService } from './ingest.service';
import { SiteEventsService } from './site-events.service';
import { InternalMetricsDto } from './contract';
import { SiteEventsDto } from './site-events.contract';

@ApiTags('ingest')
@Controller('ingest')
export class IngestController {
  constructor(
    private readonly ingest: IngestService,
    private readonly events: SiteEventsService,
  ) {}

  /**
   * ALL of the hub's statistics come in through here.
   *
   * It doesn't carry the panel's JWT: the caller is a project's cron, not a
   * person. It identifies itself with its own key, which also says which
   * project the data belongs to — so one project can't write into another.
   */
  @Post('metrics')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'X-Api-Key', description: 'Key of the pushing project', required: true })
  @ApiOperation({ summary: 'Receives the daily aggregates of a project' })
  receive(@CurrentProject() project: PushingProject, @Body() payload: InternalMetricsDto) {
    return this.ingest.receive(project, payload, RunTrigger.PUSH);
  }

  /**
   * The door for sites that have nowhere to aggregate.
   *
   * The portfolio and the client sites are Vercel pages without a database:
   * they send the raw fact —a visit, a click towards another site of the
   * group— and the hub rolls them up overnight into the same daily metrics
   * everyone else sends.
   *
   * A project that already pushes its aggregates must NOT use this door for
   * the same metrics: its push replaces the whole window and would delete
   * what was rolled up from events.
   */
  @Post('events')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'X-Api-Key', description: 'Key of the pushing project', required: true })
  @ApiOperation({ summary: 'Receives raw events from a site without its own backend' })
  receiveEvents(@CurrentProject() project: PushingProject, @Body() payload: SiteEventsDto) {
    return this.events.receive(project, payload);
  }
}
