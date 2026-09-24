import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    // The failure is logged on purpose; keep it out of the test output.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
  });

  it('returns database up when the query responds', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(controller.checkDatabase()).resolves.toEqual({ database: 'up' });
  });

  it('responds 503 whatever the driver throws', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce('socket hang up');
    await expect(controller.checkDatabase()).rejects.toMatchObject({ status: 503 });
  });

  it('responds 503 when the database fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.checkDatabase()).rejects.toMatchObject({ status: 503 });
  });

  it('does not leak the driver message in the public response', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED db.internal:5432 for user "hub_admin"'),
    );
    const error = await controller.checkDatabase().catch((e: unknown) => e);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({ database: 'down' });
  });
});
