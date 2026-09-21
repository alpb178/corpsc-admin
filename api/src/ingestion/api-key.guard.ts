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
 * Identifica al proyecto que envía sus métricas.
 *
 * La cabecera trae la clave en claro; en la base está cifrada, así que hay que
 * descifrar las candidatas y comparar. Son catorce proyectos como mucho, de
 * modo que el coste es irrelevante frente a guardar un hash sin cifrar.
 *
 * La comparación es en tiempo constante: hacerlo con `===` filtraría la clave
 * carácter a carácter por el tiempo de respuesta.
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

    // Mismo error para "sin cabecera", "clave que no existe" y "proyecto
    // desactivado": distinguirlos convertiría el endpoint en un verificador
    // de qué claves son válidas.
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

/** Lee el proyecto que ha identificado el guard. */
export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PushingProject =>
    ctx.switchToHttp().getRequest<{ project: PushingProject }>().project,
);
