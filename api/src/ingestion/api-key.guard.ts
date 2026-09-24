import {
  Logger,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';

export interface PushingProject {
  id: string;
  slug: string;
  timezone: string;
  currency: string | null;
}

/**
 * Identifies the project pushing its metrics.
 *
 * The header carries the key in plain text; in the database it's encrypted.
 * Each credential also stores a fingerprint —the first 16 hex characters of
 * its SHA-256—, so only the project whose fingerprint matches is decrypted and
 * compared, instead of every project on every request.
 *
 * That's also what keeps one unreadable credential —a key sealed before the
 * master key was rotated, a corrupt row— from taking ingestion down for
 * everyone: decrypting every candidate meant the first unreadable one threw
 * a 500 before the right one was reached. One that can't be read now just
 * doesn't match, and is logged.
 *
 * The comparison runs in constant time: doing it with `===` would leak the key
 * character by character through the response time.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { project?: PushingProject }>();
    const received = request.header('x-api-key');

    // Same error for "no header", "key that doesn't exist" and "deactivated
    // project": telling them apart would turn the endpoint into an oracle for
    // which keys are valid.
    const invalid = new UnauthorizedException('Clave no válida');
    if (!received) throw invalid;

    const candidates = await this.prisma.project.findMany({
      where: { active: true, credential: { fingerprint: this.crypto.fingerprint(received) } },
      select: {
        id: true,
        slug: true,
        timezone: true,
        currency: true,
        credential: { select: { ciphertext: true } },
      },
    });

    for (const project of candidates) {
      if (!project.credential) continue;
      let stored: string;
      try {
        stored = this.crypto.open(project.credential.ciphertext);
      } catch {
        // Its fingerprint matched but it can't be read: sealed with another
        // master key. It must be generated again in Settings.
        this.logger.error(`The credential of ${project.slug} can't be decrypted; generate a new one`);
        continue;
      }
      if (!this.crypto.safeEquals(received, stored)) continue;

      request.project = {
        id: project.id,
        slug: project.slug,
        timezone: project.timezone,
        currency: project.currency,
      };
      return true;
    }

    throw invalid;
  }
}

/** Reads the project the guard identified. */
export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PushingProject =>
    ctx.switchToHttp().getRequest<{ project: PushingProject }>().project,
);
