import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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

  private readonly logger = new Logger(HealthService.name);

  /**
   * Responds 503 if Postgres doesn't answer, so a monitor marks it as down.
   * The driver's message stays in the log: it's a public route, and that
   * message can name the host, the port or the database user.
   */
  async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: 'up' };
    } catch (error) {
      this.logger.error(`Postgres is not answering: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException({ database: 'down' });
    }
  }
}
