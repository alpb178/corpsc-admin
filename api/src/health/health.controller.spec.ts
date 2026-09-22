import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('devuelve status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
  });

  it('devuelve database up si la query responde', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(controller.checkDatabase()).resolves.toEqual({ database: 'up' });
  });

  it('responde 503 si la base de datos falla', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.checkDatabase()).rejects.toMatchObject({ status: 503 });
  });
});
