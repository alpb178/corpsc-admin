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

/** The rows the service passed to the writer. */
function rowsFrom(write: ReturnType<typeof vi.fn>) {
  return write.mock.calls[0][0].rows as Array<Record<string, unknown>>;
}

describe('IngestService', () => {
  it('turns the day totals into rows', async () => {
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    const visits = rowsFrom(write).find(
      (r) => r.metricKey === 'visits' && r.dimension === TOTAL_DIMENSION,
    );
    expect(visits).toMatchObject({ date: '2026-03-01', dimValue: TOTAL, value: 120 });
  });

  it('turns breakdowns into rows with their dimension', async () => {
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    const byCountry = rowsFrom(write).filter((r) => r.dimension === 'country');
    expect(byCountry).toHaveLength(2);
    expect(byCountry.find((r) => r.dimValue === 'BO')?.value).toBe(90);
  });

  it('carries the declared currency over to amount rows', async () => {
    // Without this someone would end up adding BOB to CUP.
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    const rows = rowsFrom(write);
    expect(rows.find((r) => r.metricKey === 'revenue')?.currency).toBe('BOB');
    expect(rows.find((r) => r.metricKey === 'visits')?.currency).toBeUndefined();
  });

  it('a breakdown by `currency` takes precedence over the declared currency', async () => {
    // take charges in USD and CUP. Without this, the peso rows would be
    // labelled as dollars and nobody would notice until adding up amounts.
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

  it('warns about an amount that declares no currency anywhere', async () => {
    // An amount without a currency can't be aggregated or compared.
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

  it('rejects a different contract version', async () => {
    const { service } = makeService();
    await expect(
      service.receive(PROJECT, payload({ schemaVersion: 2 }), RunTrigger.PUSH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces exactly the declared window', async () => {
    // The hub deletes whatever isn't inside the range, so the range rules.
    const { service, write } = makeService();
    await service.receive(PROJECT, payload(), RunTrigger.PUSH);

    expect(write.mock.calls[0][0]).toMatchObject({ from: '2026-03-01', to: '2026-03-02' });
  });

  it('infers the window from the days when none is declared', async () => {
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

  it('requires a window when the push has no days', async () => {
    // With neither range nor days the hub doesn't know which period to replace.
    const { service } = makeService();
    await expect(
      service.receive(PROJECT, payload({ range: undefined, days: [] }), RunTrigger.PUSH),
    ).rejects.toThrow(/declarar `range`/);
  });

  it('rejects an oversized window', async () => {
    const { service } = makeService();
    await expect(
      service.receive(
        PROJECT,
        payload({ range: { from: '2024-01-01', to: '2026-03-01' } }),
        RunTrigger.PUSH,
      ),
    ).rejects.toThrow(/ventana máxima/);
  });

  it('discards days outside the declared window', async () => {
    // The replacement only covers the window: a day outside it would stay
    // written forever without anyone ever touching it again.
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

  it('registers new metrics as inactive and stores them anyway', async () => {
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

  it('warns when the push declares a different timezone', async () => {
    // A timezone mismatch shifts the series by a day and nobody notices until
    // someone compares two sites.
    const { service } = makeService();
    const result = await service.receive(
      PROJECT,
      payload({ timezone: 'UTC' }),
      RunTrigger.PUSH,
    );

    expect(result.status).toBe(RunStatus.PARTIAL);
    expect(result.warnings.some((w) => w.includes('zona'))).toBe(true);
  });

  it('trims an oversized breakdown instead of swallowing it whole', async () => {
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

    const paths = rowsFrom(write).filter((r) => r.dimension === 'path');
    expect(paths.length).toBeLessThanOrEqual(101); // top-100 plus `__other__`
    expect(result.warnings.some((w) => w.includes('recortó'))).toBe(true);
  });

  it('rejects an empty push over existing data instead of emptying the window', async () => {
    // The most dangerous failure in the design: a broken query in the project
    // returns zero rows and the replacement would wipe out good data.
    const { service, write } = makeService();
    write.mockRejectedValueOnce(new EmptyResultError('ya había 500 filas'));

    await expect(
      service.receive(PROJECT, payload({ days: [] }), RunTrigger.PUSH),
    ).rejects.toThrow(/no se ha borrado nada|No se ha borrado nada/i);
  });
});
