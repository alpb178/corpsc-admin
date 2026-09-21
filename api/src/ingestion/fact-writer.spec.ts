import 'dotenv/config';
import { PrismaClient, ProjectKind, RunStatus, RunTrigger } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FactWriterService, EmptyResultError } from './fact-writer.service';
import { toUtcDate } from './common/dates';
import { TOTAL, TOTAL_DIMENSION, type MetricRow } from './common/metric-row';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Estos tests tocan Postgres de verdad. La lógica que prueban —upsert
 * idempotente y borrado de huérfanos— vive en SQL, así que con un mock no se
 * estaría probando nada.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const writer = new FactWriterService(prisma as unknown as PrismaService);

const SLUG = 'test-fact-writer';
const FROM = '2026-03-01';
const TO = '2026-03-03';

let projectId: string;
let runId: string;

function row(date: string, dimValue: string, value: number, metricKey = 'sessions'): MetricRow {
  return { date, metricKey, dimension: dimValue === TOTAL ? TOTAL_DIMENSION : 'country', dimValue, value };
}

async function newRun(): Promise<string> {
  const run = await prisma.ingestionRun.create({
    data: {
      projectId,
      trigger: RunTrigger.PUSH,
      status: RunStatus.SUCCESS,
      windowFrom: toUtcDate(FROM),
      windowTo: toUtcDate(TO),
    },
  });
  return run.id;
}

function storedRows() {
  return prisma.metricDaily.findMany({
    where: { projectId },
    orderBy: [{ date: 'asc' }, { dimValue: 'asc' }],
    select: { date: true, metricKey: true, dimension: true, dimValue: true, value: true },
  });
}

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  const project = await prisma.project.create({
    data: { slug: SLUG, name: 'Test', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN },
  });
  projectId = project.id;
});

beforeEach(async () => {
  await prisma.metricDaily.deleteMany({ where: { projectId } });
  runId = await newRun();
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('FactWriterService', () => {
  it('escribe las filas de la ventana', async () => {
    const result = await writer.write({
      projectId,
      runId,
      from: FROM,
      to: TO,
      rows: [row('2026-03-01', TOTAL, 100), row('2026-03-01', 'BO', 60)],
    });

    expect(result.rowsWritten).toBe(2);
    expect(result.rowsDeleted).toBe(0);
    expect(await storedRows()).toHaveLength(2);
  });

  it('reingerir lo mismo no duplica y actualiza el valor', async () => {
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 100)],
    });

    // Un pedido pendiente que se cobra: el mismo día vuelve con otro número.
    const second = await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 115)],
    });

    const stored = await storedRows();
    expect(stored).toHaveLength(1);
    expect(Number(stored[0].value)).toBe(115);
    expect(second.rowsDeleted).toBe(0);
  });

  it('borra las filas que el origen ya no devuelve', async () => {
    // 'CL' estaba en el top-N ayer; hoy ya no. Si no se borrase, se quedaría
    // congelada con su valor viejo y el desglose dejaría de sumar el total.
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', 'BO', 60), row('2026-03-01', 'CL', 5)],
    });

    const second = await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', 'BO', 60)],
    });

    expect(second.rowsDeleted).toBe(1);
    expect((await storedRows()).map((r) => r.dimValue)).toEqual(['BO']);
  });

  it('no toca lo que está fuera de la ventana', async () => {
    await writer.write({
      projectId, runId, from: '2026-02-01', to: '2026-02-28',
      rows: [row('2026-02-15', TOTAL, 999)],
    });

    await writer.write({
      projectId, runId: await newRun(), from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 100)],
    });

    const fechas = (await storedRows()).map((r) => r.date.toISOString().slice(0, 10));
    expect(fechas).toContain('2026-02-15');
  });

  it('NO borra nada si el origen devuelve cero filas habiendo datos', async () => {
    // El fallo más peligroso del diseño: un cambio de permisos o un id mal
    // escrito devuelven 200 con cero filas, y el borrado de huérfanos se
    // llevaría por delante datos buenos. Debe abortar, no vaciar.
    await writer.write({
      projectId, runId, from: FROM, to: TO,
      rows: [row('2026-03-01', TOTAL, 100), row('2026-03-02', TOTAL, 120)],
    });

    await expect(
      writer.write({
        projectId, runId: await newRun(), from: FROM, to: TO, rows: [],
      }),
    ).rejects.toThrow(EmptyResultError);

    expect(await storedRows()).toHaveLength(2);
  });

  it('acepta cero filas si la ventana también estaba vacía', async () => {
    const result = await writer.write({
      projectId, runId, from: FROM, to: TO, rows: [],
    });

    expect(result).toEqual({ rowsWritten: 0, rowsDeleted: 0 });
  });

  it('escribe lotes grandes de una vez', async () => {
    const rows = Array.from({ length: 2_500 }, (_, i) =>
      row('2026-03-01', `pais-${i}`, i + 1),
    );

    const result = await writer.write({
      projectId, runId, from: FROM, to: TO, rows,
    });

    expect(result.rowsWritten).toBe(2_500);
  });
});
