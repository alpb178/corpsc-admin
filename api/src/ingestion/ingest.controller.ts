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

  /**
   * La puerta de los sitios que no tienen dónde agregar.
   *
   * El portfolio y los sitios de cliente son páginas en Vercel sin base de
   * datos: mandan el hecho suelto —una visita, un clic hacia otro sitio del
   * grupo— y el hub los consolida de madrugada en las mismas métricas diarias
   * que envía todo el mundo.
   *
   * Un proyecto que ya empuja sus agregados NO debe usar esta puerta para las
   * mismas métricas: su envío reemplaza la ventana entera y borraría lo
   * consolidado desde eventos.
   */
  @Post('events')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'X-Api-Key', description: 'Clave del proyecto que envía', required: true })
  @ApiOperation({ summary: 'Recibe eventos sueltos de un sitio sin backend propio' })
  receiveEvents(@CurrentProject() project: PushingProject, @Body() payload: SiteEventsDto) {
    return this.events.receive(project, payload);
  }
}
