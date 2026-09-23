import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SiteEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventRollupService } from './event-rollup.service';
import { MAX_EVENT_AGE_HOURS, type SiteEventsDto } from './site-events.contract';
import type { PushingProject } from './api-key.guard';

const TYPES: Record<string, SiteEventType> = {
  page_view: SiteEventType.PAGE_VIEW,
  site_click: SiteEventType.SITE_CLICK,
  click: SiteEventType.CLICK,
};

export interface ReceiveEventsResult {
  accepted: number;
}

/**
 * Recibe los eventos de un sitio sin backend y los guarda crudos.
 *
 * Aquí no se cuenta nada: se pide a `EventRollupService` que consolide en unos
 * segundos, y el panel lo refleja casi en directo. Contar sobre la marcha sería
 * más rápido, pero un contador incrementado no se puede deshacer; recalcular
 * desde lo crudo sí, si más tarde hay que filtrar un bot o corregir la zona
 * horaria del proyecto.
 */
@Injectable()
export class SiteEventsService {
  private readonly logger = new Logger(SiteEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rollup: EventRollupService,
  ) {}

  async receive(project: PushingProject, payload: SiteEventsDto): Promise<ReceiveEventsResult> {
    const now = Date.now();
    const oldestAccepted = now - MAX_EVENT_AGE_HOURS * 3_600_000;

    const data = payload.events.map((event) => {
      // Un clic sin destino no se puede desglosar y acabaría engordando un
      // cubo anónimo que no dice nada. Mejor rechazarlo y que se note.
      if (event.type === 'site_click' && !event.target) {
        throw new BadRequestException('Un evento site_click necesita `target`');
      }
      // Un clic sin sección ni etiqueta no dice dónde se hizo, que es lo único
      // que aporta sobre contar páginas.
      if (event.type === 'click' && (!event.section || !event.label)) {
        throw new BadRequestException('Un evento click necesita `section` y `label`');
      }
      const isClick = event.type !== 'page_view';

      return {
        projectId: project.id,
        type: TYPES[event.type],
        sessionId: event.sessionId,
        path: event.path,
        target: event.type === 'site_click' ? (event.target ?? null) : null,
        linkType: event.type === 'site_click' ? (event.linkType ?? null) : null,
        section: isClick ? (event.section ?? null) : null,
        label: isClick ? (event.label ?? null) : null,
        occurredAt: this.stamp(event.at, now, oldestAccepted),
      };
    });

    await this.prisma.siteEvent.createMany({ data });
    this.rollup.scheduleLive(project);

    return { accepted: data.length };
  }

  /**
   * El instante del evento, acotado.
   *
   * Se acepta el que declara el sitio porque un beacon puede salir al cerrar
   * la pestaña, pero solo dentro de una ventana razonable: fuera de ella manda
   * la hora de llegada. El emisor no debería poder escribir en un día que ya
   * se dio por cerrado, ni en el futuro.
   */
  private stamp(at: string | undefined, now: number, oldestAccepted: number): Date {
    if (!at) return new Date(now);

    const declared = Date.parse(at);
    if (Number.isNaN(declared) || declared > now || declared < oldestAccepted) {
      return new Date(now);
    }
    return new Date(declared);
  }
}
