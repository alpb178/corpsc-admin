import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Responde 503 si Postgres no contesta, para que un monitor lo marque caído. */
  async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: 'up' };
    } catch (error) {
      throw new ServiceUnavailableException({
        database: 'down',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
