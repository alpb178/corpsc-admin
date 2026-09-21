import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RunTrigger } from '@prisma/client';
import { ApiKeyGuard, CurrentProject, type PushingProject } from './api-key.guard';
import { IngestService } from './ingest.service';
import { InternalMetricsDto } from './contract';

@ApiTags('ingest')
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  /**
   * Por aquí entran TODAS las estadísticas del hub.
   *
   * No lleva el JWT del panel: quien llama es el cron de un proyecto, no una
   * persona. Se identifica con su propia clave, que a la vez dice de qué
   * proyecto son los datos — así un proyecto no puede escribir en otro.
   */
  @Post('metrics')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'X-Api-Key', description: 'Clave del proyecto que envía', required: true })
  @ApiOperation({ summary: 'Recibe los agregados diarios de un proyecto' })
  receive(@CurrentProject() project: PushingProject, @Body() payload: InternalMetricsDto) {
    return this.ingest.receive(project, payload, RunTrigger.PUSH);
  }
}
