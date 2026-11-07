import { Test, TestingModule } from '@nestjs/testing';
import { PushDeviceService } from './push-device.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PushDeviceService', () => {
  let service: PushDeviceService;
  let prisma: PrismaService;

  const pushDeviceUpsert = jest.fn();
  const pushDeviceFindFirst = jest.fn();
  const pushDeviceDelete = jest.fn();
  const pushDeviceFindUnique = jest.fn();
  const pushDeviceFindMany = jest.fn();
  const pushDeviceDeleteMany = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushDeviceService,
        {
          provide: PrismaService,
          useValue: {
            pushDevice: {
              upsert: pushDeviceUpsert,
              findFirst: pushDeviceFindFirst,
              delete: pushDeviceDelete,
              findUnique: pushDeviceFindUnique,
              findMany: pushDeviceFindMany,
              deleteMany: pushDeviceDeleteMany,
            },
          },
        },
      ],
    }).compile();

    service = module.get<PushDeviceService>(PushDeviceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerOrUpdate', () => {
    it('crea un nuevo dispositivo cuando el token no existe', async () => {
      pushDeviceUpsert.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        token: 'fcm-token-123',
        platform: 'android',
      });

      const result = await service.registerOrUpdate(
        'user-1',
        'fcm-token-123',
        'android',
      );

      expect(pushDeviceUpsert).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123' },
        update: {
          userId: 'user-1',
          platform: 'android',
          updatedAt: expect.any(Date),
        },
        create: {
          userId: 'user-1',
          token: 'fcm-token-123',
          platform: 'android',
        },
      });
      expect(result).toEqual({
        id: 'dev-1',
        userId: 'user-1',
        token: 'fcm-token-123',
        platform: 'android',
      });
    });

    it('actualiza el dispositivo existente sin duplicar', async () => {
      pushDeviceUpsert.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        token: 'fcm-token-123',
        platform: 'ios',
      });

      await service.registerOrUpdate('user-1', 'fcm-token-123', 'ios');

      // El upsert usa `where: { token }`, así que nunca duplica por token.
      expect(pushDeviceUpsert).toHaveBeenCalledTimes(1);
      expect(pushDeviceUpsert).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123' },
        update: expect.objectContaining({ platform: 'ios', userId: 'user-1' }),
        create: expect.objectContaining({ platform: 'ios', userId: 'user-1' }),
      });
    });
  });

  describe('remove', () => {
    it('elimina el dispositivo del usuario autenticado', async () => {
      pushDeviceFindFirst.mockResolvedValue({
        id: 'dev-1',
        token: 'fcm-token-123',
        userId: 'user-1',
      });
      pushDeviceDelete.mockResolvedValue({ id: 'dev-1' });

      await service.remove('user-1', 'fcm-token-123');

      expect(pushDeviceFindFirst).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123', userId: 'user-1' },
      });
      expect(pushDeviceDelete).toHaveBeenCalledWith({ where: { id: 'dev-1' } });
    });

    it('lanza NotFoundException cuando el dispositivo no pertenece al usuario', async () => {
      pushDeviceFindFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', 'fcm-token-123')).rejects.toThrow(
        'Dispositivo no encontrado',
      );
    });
  });

  describe('findAdminDevices', () => {
    it('devuelve solo dispositivos de usuarios ADMIN', async () => {
      pushDeviceFindMany.mockResolvedValue([
        {
          id: 'dev-1',
          token: 'token-1',
          platform: 'android',
          userId: 'admin-1',
        },
      ]);

      const result = await service.findAdminDevices();

      expect(pushDeviceFindMany).toHaveBeenCalledWith({
        where: { user: { role: 'ADMIN' } },
        select: {
          id: true,
          token: true,
          platform: true,
          userId: true,
        },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findByToken y deleteByToken', () => {
    it('busca dispositivo por token', async () => {
      pushDeviceFindUnique.mockResolvedValue({
        id: 'dev-1',
        token: 'fcm-token-123',
        userId: 'user-1',
        platform: 'android',
      });

      const result = await service.findByToken('fcm-token-123');

      expect(pushDeviceFindUnique).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123' },
        select: expect.any(Object),
      });
      expect(result?.token).toBe('fcm-token-123');
    });

    it('elimina dispositivo por token (invalido)', async () => {
      pushDeviceDelete.mockResolvedValue({
        id: 'dev-1',
        token: 'fcm-token-123',
      });

      await service.deleteByToken('fcm-token-123');

      expect(pushDeviceDelete).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123' },
      });
    });

    it('deleteByTokenIfPresent es idempotente', async () => {
      pushDeviceDeleteMany.mockResolvedValue({ count: 0 });

      const deleted = await service.deleteByTokenIfPresent('fcm-token-123');

      expect(deleted).toBe(0);
      expect(pushDeviceDeleteMany).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123' },
      });
    });
  });
});
