import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** A partir de aquí un silencio deja de ser normal y pasa a ser un aviso. */
const WARN_AFTER_HOURS = 30;
/** Y a partir de aquí, un problema. */
const STALE_AFTER_HOURS = 72;

export type Freshness = 'OK' | 'LATE' | 'STALE' | 'NEVER';

export interface ProjectFreshness {
  slug: string;
  name: string;
  lastPushAt: Date | null;
  hoursSince: number | null;
  freshness: Freshness;
}

/**
 * Vigila que los proyectos sigan enviando.
 *
 * Es la contrapartida de recibir en lugar de ir a buscar: cuando el hub
 * tiraba de Google, un fallo dejaba una ingesta en rojo que se veía. Ahora, si
 * el cron de un proyecto se rompe, no pasa nada visible — simplemente dejan de
 * llegar datos, y la gráfica se queda plana sin que nadie sepa por qué.
 *
 * Por eso el silencio es una señal de primera clase y no un efecto secundario.
 */
@Injectable()
export class FreshnessService {
  private readonly logger = new Logger(FreshnessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Clasifica un instante de último envío. Única definición de "al día". */
  classify(lastPushAt: Date | null, now = Date.now()): { freshness: Freshness; hoursSince: number | null } {
    if (!lastPushAt) return { freshness: 'NEVER', hoursSince: null };

    const hours = (now - lastPushAt.getTime()) / 3_600_000;
    const freshness: Freshness =
      hours > STALE_AFTER_HOURS ? 'STALE' : hours > WARN_AFTER_HOURS ? 'LATE' : 'OK';

    return { freshness, hoursSince: Math.round(hours) };
  }

  async report(): Promise<ProjectFreshness[]> {
    const projects = await this.prisma.project.findMany({
      where: { active: true },
      select: { slug: true, name: true, lastPushAt: true, credentialId: true },
      orderBy: [{ sortOrder: 'asc' }],
    });

    const now = Date.now();

    return projects
      // Un proyecto sin clave todavía no está conectado: no está callado,
      // está por configurar. Mezclarlos llenaría el informe de ruido.
      .filter((p) => p.credentialId !== null)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        lastPushAt: p.lastPushAt,
        ...this.classify(p.lastPushAt, now),
      }));
  }

  /** Una vez al día, a media mañana: la hora a la que ya deberían haber enviado todos. */
  @Cron('0 0 10 * * *', { timeZone: 'America/La_Paz', name: 'freshness-check' })
  async check(): Promise<void> {
    const callados = (await this.report()).filter(
      (p) => p.freshness === 'STALE' || p.freshness === 'NEVER',
    );

    if (callados.length === 0) return;

    this.logger.warn(
      `Sin datos recientes de: ${callados
        .map((p) => `${p.slug} (${p.hoursSince === null ? 'nunca ha enviado' : `${p.hoursSince} h`})`)
        .join(', ')}`,
    );
  }
}
