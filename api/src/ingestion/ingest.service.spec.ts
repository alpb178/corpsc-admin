import { BadRequestException } from '@nestjs/common';
import { RunStatus, RunTrigger } from '@prisma/client';
import { IngestService } from './ingest.service';
import { EmptyResultError, type FactWriterService } from './fact-writer.service';
import { TOTAL, TOTAL_DIMENSION } from './common/metric-row';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushingProject } from './api-key.guard';
import type { InternalMetricsDto } from './contract';

const PROJECT: PushingProject = {
  id: 'p1',
  slug: 'tu-chamba',
  timezone: 'America/La_Paz',
  currency: null,
};

function payload(overrides: Partial<InternalMetricsDto> = {}): InternalMetricsDto {
  return {
    schemaVersion: 1,
    project: 'tu-chamba',
    timezone: 'America/La_Paz',
    range: { from: '2026-03-01', to: '2026-03-02' },
    definitions: [
      { key: 'visits', label: 'Visitas', unit: 'count', aggregation: 'sum' },
      { key: 'revenue', label: 'Ingresos', unit: 'currency', aggregation: 'sum', currency: 'BOB' },
    ],
    days: [
      {
        date: '2026-03-01',
        metrics: { visits: 120, revenue: 3450.5 },
        breakdowns: [{ metric: 'visits', dimension: 'country', values: { BO: 90, AR: 30 } }],
      },
    ],
    ...overrides,
  } as InternalMetricsDto;
}

function makeService(known: string[] = ['visits', 'revenue']) {
  const write = vi.fn().mockResolvedValue({ rowsWritten: 0, rowsDeleted: 0 });
  const createMany = vi.fn().mockResolvedValue({ count: 0 });

  const prisma = {
    metricDefinition: {
      findMany: vi.fn().mockResolvedValue(known.map((key) => ({ key }))),
      createMany,
    },
    ingestionRun: {
      create: vi.fn().mockResolvedValue({ id: 'run1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    project: { update: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  const factWriter = { write } as unknown as FactWriterService;
  return { service: new IngestService(prisma, factWriter), write, createMany, prisma };
}

/** Las filas que el servicio ha pasado al escritor. */
function rowsFrom(write: ReturnType<typeof vi.fn>) {
  return write.mock.calls[0][0].rows as Array<Record<string, unknown>>;
}

describe('IngestService', () => {
  it('convierte los totales del día en filas', async () => {
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    const visits = rowsFrom(write).find(
      (r) => r.metricKey === 'visits' && r.dimension === TOTAL_DIMENSION,
    );
    expect(visits).toMatchObject({ date: '2026-03-01', dimValue: TOTAL, value: 120 });
  });

  it('convierte los desgloses con su dimensión', async () => {
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    const porPais = rowsFrom(write).filter((r) => r.dimension === 'country');
    expect(porPais).toHaveLength(2);
    expect(porPais.find((r) => r.dimValue === 'BO')?.value).toBe(90);
  });

  it('arrastra la moneda declarada a las filas de importes', async () => {
    // Sin esto alguien acabaría sumando BOB con CUP.
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    const rows = rowsFrom(write);
    expect(rows.find((r) => r.metricKey === 'revenue')?.currency).toBe('BOB');
    expect(rows.find((r) => r.metricKey === 'visits')?.currency).toBeUndefined();
  });

  it('un desglose por `currency` manda sobre la moneda declarada', async () => {
    // take cobra en USD y en CUP. Sin esto, las filas en pesos quedarían
    // etiquetadas como dólares y nadie lo notaría hasta sumar importes.
    const { service, write } = makeService();
    await service.receive(
      PROJECT,
      payload({
        definitions: [{ key: 'revenue', label: 'Ingresos', unit: 'currency' }],
        days: [
          {
            date: '2026-03-01',
            metrics: {},
            breakdowns: [
              { metric: 'revenue', dimension: 'currency', values: { USD: 210, CUP: 84000 } },
            ],
          },
        ],
      }),
      RunTrigger.PUSH,
    );

    const rows = rowsFrom(write);
    expect(rows.find((r) => r.dimValue === 'USD')).toMatchObject({ currency: 'USD', value: 210 });
    expect(rows.find((r) => r.dimValue === 'CUP')).toMatchObject({ currency: 'CUP', value: 84000 });
  });

  it('avisa de un importe que no declara moneda por ningún lado', async () => {
    // Un importe sin moneda no se puede agregar ni comparar.
    const { service } = makeService();
    const result = await service.receive(
      PROJECT,
      payload({
        definitions: [{ key: 'revenue', label: 'Ingresos', unit: 'currency' }],
        days: [{ date: '2026-03-01', metrics: { revenue: 100 } }],
      }),
      RunTrigger.PUSH,
    );

    expect(result.warnings.some((w) => w.includes('no declara moneda'))).toBe(true);
  });

  it('rechaza una versión de contrato distinta', async () => {
    const { service } = makeService();
    await expect(
      service.receive(PROJECT, payload({ schemaVersion: 2 }), RunTrigger.PUSH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reemplaza exactamente la ventana declarada', async () => {
    // El hub borra lo que no venga dentro del rango, así que el rango manda.
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    expect(write.mock.calls[0][0]).toMatchObject({ from: '2026-03-01', to: '2026-03-02' });
  });

  it('deduce la ventana de los días si no se declara', async () => {
    const { service, write } = makeService();
    await service.receive(
      PROJECT,
      payload({
        range: undefined,
        days: [
          { date: '2026-03-05', metrics: { visits: 1 } },
          { date: '2026-03-03', metrics: { visits: 2 } },
        ],
      }),
      RunTrigger.PUSH,
    );

    expect(write.mock.calls[0][0]).toMatchObject({ from: '2026-03-03', to: '2026-03-05' });
  });

  it('exige ventana si el envío no trae días', async () => {
    // Sin rango ni días el hub no sabe qué periodo reemplazar.
    const { service } = makeService();
    await expect(
      service.receive(PROJECT, payload({ range: undefined, days: [] }), RunTrigger.PUSH),
    ).rejects.toThrow(/declarar `range`/);
  });

  it('rechaza una ventana desmesurada', async () => {
    const { service } = makeService();
    await expect(
      service.receive(
        PROJECT,
        payload({ range: { from: '2024-01-01', to: '2026-03-01' } }),
        RunTrigger.PUSH,
      ),
    ).rejects.toThrow(/ventana máxima/);
  });

  it('descarta los días fuera de la ventana declarada', async () => {
    // El reemplazo solo cubre la ventana: un día de fuera quedaría escrito
    // para siempre sin que nadie lo volviera a tocar.
    const { service, write } = makeService();
    await service.receive(
      PROJECT,
      payload({
        days: [
          { date: '2026-03-01', metrics: { visits: 120 } },
          { date: '2025-12-25', metrics: { visits: 999 } },
        ],
      }),
      RunTrigger.PUSH,
    );

    expect(rowsFrom(write).every((r) => r.date === '2026-03-01')).toBe(true);
  });

  it('registra las métricas nuevas como inactivas y las guarda igual', async () => {
    const { service, write, createMany } = makeService(['visits']);
    await service.receive(
      PROJECT,
      payload({
        definitions: [{ key: 'leads', label: 'Contactos', unit: 'count' }],
        days: [{ date: '2026-03-01', metrics: { leads: 7 } }],
      }),
      RunTrigger.PUSH,
    );

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ key: 'leads', active: false })] }),
    );
    expect(rowsFrom(write).find((r) => r.metricKey === 'leads')?.value).toBe(7);
  });

  it('avisa si el envío declara otra zona horaria', async () => {
    // Un desajuste horario desplaza las series un día y no se nota hasta que
    // alguien compara dos sitios.
    const { service } = makeService();
    const result = await service.receive(
      PROJECT,
      payload({ timezone: 'UTC' }),
      RunTrigger.PUSH,
    );

    expect(result.status).toBe(RunStatus.PARTIAL);
    expect(result.warnings.some((w) => w.includes('zona'))).toBe(true);
  });

  it('recorta un desglose desmesurado en vez de tragárselo', async () => {
    const values: Record<string, number> = {};
    for (let i = 0; i < 250; i++) values[`/ruta-${i}`] = 250 - i;

    const { service, write } = makeService();
    const result = await service.receive(
      PROJECT,
      payload({
        days: [
          {
            date: '2026-03-01',
            metrics: { visits: 1 },
            breakdowns: [{ metric: 'page_views', dimension: 'path', values }],
          },
        ],
      }),
      RunTrigger.PUSH,
    );

    const rutas = rowsFrom(write).filter((r) => r.dimension === 'path');
    expect(rutas.length).toBeLessThanOrEqual(101); // top-100 más `__other__`
    expect(result.warnings.some((w) => w.includes('recortó'))).toBe(true);
  });

  it('un envío vacío sobre datos existentes se rechaza, no vacía la ventana', async () => {
    // El fallo más peligroso del diseño: una consulta rota en el proyecto
    // devuelve cero filas y el reemplazo se llevaría por delante datos buenos.
    const { service, write } = makeService();
    write.mockRejectedValueOnce(new EmptyResultError('ya había 500 filas'));

    await expect(
      service.receive(PROJECT, payload({ days: [] }), RunTrigger.PUSH),
    ).rejects.toThrow(/no se ha borrado nada|No se ha borrado nada/i);
  });
});
