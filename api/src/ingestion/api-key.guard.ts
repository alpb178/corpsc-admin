import {
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
 * The header carries the key in plain text; in the database it's encrypted,
 * so the candidates have to be decrypted and compared. There are fourteen
 * projects at most, so the cost is irrelevant compared to storing an
 * unencrypted hash.
 *
 * The comparison runs in constant time: doing it with `===` would leak the key
 * character by character through the response time.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
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
      where: { active: true, credentialId: { not: null } },
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
      if (!this.crypto.safeEquals(received, this.crypto.open(project.credential.ciphertext))) continue;

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
