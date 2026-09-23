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
 * Receives the events of a site without a backend and stores them raw.
 *
 * Nothing is counted here: `EventRollupService` is asked to roll up in a few
 * seconds, and the panel reflects it almost live. Counting on the fly would be
 * faster, but an incremented counter can't be undone; recomputing from raw
 * data can, if later a bot has to be filtered out or the project's timezone
 * corrected.
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
      // A click without a target can't be broken down and would end up
      // fattening an anonymous bucket that says nothing. Better to reject it
      // and make it noticeable.
      if (event.type === 'site_click' && !event.target) {
        throw new BadRequestException('Un evento site_click necesita `target`');
      }
      // A click without section or label doesn't say where it happened, which
      // is the only thing it adds over counting pages.
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
        country: event.country ?? null,
        // The origin only makes sense on the landing page.
        referrer: event.type === 'page_view' ? normalizeHost(event.referrer) : null,
        utmSource: event.type === 'page_view' ? (event.utmSource?.toLowerCase() ?? null) : null,
        utmMedium: event.type === 'page_view' ? (event.utmMedium?.toLowerCase() ?? null) : null,
        utmCampaign: event.type === 'page_view' ? (event.utmCampaign ?? null) : null,
        occurredAt: this.stamp(event.at, now, oldestAccepted),
      };
    });

    await this.prisma.siteEvent.createMany({ data });
    this.rollup.scheduleLive(project);

    return { accepted: data.length };
  }

  /**
   * The event's instant, bounded.
   *
   * The one the site declares is accepted because a beacon can go out when the
   * tab closes, but only within a reasonable window: outside it, the arrival
   * time wins. The sender shouldn't be able to write into a day already
   * considered closed, nor into the future.
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

/** `www.google.com` and `google.com` are the same source. */
function normalizeHost(host: string | undefined): string | null {
  if (!host) return null;
  return host.toLowerCase().replace(/^(www|m|l|lm)\./, '');
}
