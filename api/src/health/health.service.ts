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

  /** Responds 503 if Postgres doesn't answer, so a monitor marks it as down. */
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
