import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EventRollupService } from '../src/ingestion/event-rollup.service';
import { FactWriterService } from '../src/ingestion/fact-writer.service';
import { isIsoDate } from '../src/ingestion/common/dates';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Consolida a mano los eventos de un sitio, sin esperar al cron de las 03:00.
 *
 * Para dos cosas:
 *   - Probar en local: se mandan cuatro beacons y se ven las cifras al momento,
 *     en lugar de dejar el portátil encendido hasta la madrugada.
 *   - Rehacer un histórico en producción cuando algo cambió después: una zona
 *     horaria mal puesta, un bot que se descubre tarde.
 *
 *   pnpm rollup                       todos los proyectos activos, últimos 4 días
 *   pnpm rollup corpsc                solo ese proyecto
 *   pnpm rollup corpsc 2026-09-01 2026-09-21
 *
 * Es idempotente: reconsolidar una ventana la reescribe entera, no la duplica.
 *
 * Los servicios se construyen a mano en lugar de levantar el contexto de Nest
 * porque este script corre con tsx, y esbuild no emite `design:paramtypes`: la
 * inyección por tipo dejaría el PrismaService sin resolver. Es el mismo cableado
 * manual que usan los tests.
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

      // Sin eventos no se escribe nada, y decirlo importa: un sitio callado no
      // es un sitio con cero visitas.
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
