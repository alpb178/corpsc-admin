import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EventRollupService } from '../src/ingestion/event-rollup.service';
import { FactWriterService } from '../src/ingestion/fact-writer.service';
import { isIsoDate } from '../src/ingestion/common/dates';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Rolls up a site's events by hand, without waiting for the 03:00 cron.
 *
 * Good for two things:
 *   - Testing locally: send four beacons and see the figures right away,
 *     instead of leaving the laptop on until the small hours.
 *   - Redoing history in production when something changed afterwards: a
 *     wrongly set timezone, a bot discovered late.
 *
 *   pnpm rollup                       all active projects, last 4 days
 *   pnpm rollup corpsc                only that project
 *   pnpm rollup corpsc 2026-09-01 2026-09-21
 *
 * It's idempotent: rolling up a window again rewrites it whole, it doesn't
 * duplicate it.
 *
 * The services are built by hand instead of booting the Nest context because
 * this script runs on tsx, and esbuild doesn't emit `design:paramtypes`:
 * type-based injection would leave PrismaService unresolved. It's the same
 * manual wiring the tests use.
 */
async function main(): Promise<void> {
  const [slug, from, to] = process.argv.slice(2);

  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
    throw new Error('Las fechas van en formato YYYY-MM-DD');
  }
  if (Boolean(from) !== Boolean(to)) {
    throw new Error('La ventana necesita las dos fechas: desde y hasta');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const client = prisma as unknown as PrismaService;
  const rollup = new EventRollupService(client, new FactWriterService(client));

  try {
    const projects = await prisma.project.findMany({
      where: { active: true, ...(slug ? { slug } : {}) },
      select: { id: true, slug: true, timezone: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (projects.length === 0) {
      throw new Error(slug ? `No existe el proyecto activo "${slug}"` : 'No hay proyectos activos');
    }

    for (const project of projects) {
      const result =
        from && to
          ? await rollup.rollupWindow(project, from, to)
          : await rollup.rollup(project);

      // Without events nothing is written, and saying so matters: a quiet site
      // isn't a site with zero visits.
      console.log(
        result
          ? `  ✓ ${project.slug}: ${result.rowsWritten} filas (${result.rowsDeleted} reemplazadas)`
          : `  · ${project.slug}: sin eventos en la ventana`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
