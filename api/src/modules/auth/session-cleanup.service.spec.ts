import { Test, TestingModule } from '@nestjs/testing';
import { SessionCleanupService } from './session-cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;
  // Tipado para que los matchers del mock no cuenten como `any`.
  const sessionDeleteMany = jest.fn<
    Promise<{ count: number }>,
    [{ where: { expiresAt: { lt: Date } } }]
  >();

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    sessionDeleteMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionCleanupService,
        {
          provide: PrismaService,
          useValue: { session: { deleteMany: sessionDeleteMany } },
        },
      ],
    }).compile();

    service = module.get<SessionCleanupService>(SessionCleanupService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('borra solo las sesiones ya caducadas', async () => {
    sessionDeleteMany.mockResolvedValue({ count: 137 });

    const borradas = await service.sweep();

    expect(borradas).toBe(137);
    // El filtro por fecha es la garantia de que ninguna sesion activa se borra.
    const esperado: [{ where: { expiresAt: { lt: Date } } }] =
      sessionDeleteMany.mock.calls[0];
    expect(esperado[0].where.expiresAt.lt).toBeInstanceOf(Date);
  });

  it('no revienta si la base de datos falla', async () => {
    sessionDeleteMany.mockRejectedValue(new Error('db caida'));

    await expect(service.sweep()).resolves.toBe(0);
  });
});
