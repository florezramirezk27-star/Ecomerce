import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PushDeviceService } from './push-device.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PushDeviceService', () => {
  let service: PushDeviceService;
  let prisma: PrismaService;

  const pushDeviceCreate = jest.fn();
  const pushDeviceUpdate = jest.fn();
  const pushDeviceFindFirst = jest.fn();
  const pushDeviceDelete = jest.fn();
  const pushDeviceFindUnique = jest.fn();
  const pushDeviceFindMany = jest.fn();
  const pushDeviceDeleteMany = jest.fn();

  function prismaKnownError(code: string) {
    return new Prisma.PrismaClientKnownRequestError(
      'Prisma test error',
      { code, clientVersion: '6.19.3' },
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushDeviceService,
        {
          provide: PrismaService,
          useValue: {
            pushDevice: {
              create: pushDeviceCreate,
              update: pushDeviceUpdate,
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
    it('crea un dispositivo cuando el token todavía no existe', async () => {
      pushDeviceFindUnique.mockResolvedValueOnce(null);
      pushDeviceCreate.mockResolvedValue({
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

      expect(pushDeviceFindUnique).toHaveBeenCalledWith({
        where: { token: 'fcm-token-123' },
        select: { id: true, userId: true },
      });
      expect(pushDeviceCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          token: 'fcm-token-123',
          platform: 'android',
        },
      });
      expect(pushDeviceUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'dev-1',
        userId: 'user-1',
        token: 'fcm-token-123',
        platform: 'android',
      });
    });

    it('actualiza la plataforma si el token ya pertenece al mismo usuario', async () => {
      pushDeviceFindUnique.mockResolvedValueOnce({
        id: 'dev-1',
        userId: 'user-1',
      });
      pushDeviceUpdate.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        token: 'fcm-token-123',
        platform: 'ios',
      });

      await service.registerOrUpdate('user-1', 'fcm-token-123', 'ios');

      expect(pushDeviceUpdate).toHaveBeenCalledWith({
        where: { id: 'dev-1', userId: 'user-1' },
        data: {
          platform: 'ios',
          updatedAt: expect.any(Date),
        },
      });
      expect(pushDeviceCreate).not.toHaveBeenCalled();
    });

    it('rechaza un token que ya pertenece a otro usuario', async () => {
      pushDeviceFindUnique.mockResolvedValueOnce({
        id: 'dev-1',
        userId: 'user-2',
      });

      await expect(
        service.registerOrUpdate('user-1', 'fcm-token-123', 'ios'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(pushDeviceCreate).not.toHaveBeenCalled();
      expect(pushDeviceUpdate).not.toHaveBeenCalled();
    });

    it('resuelve una carrera de INSERT sin reasignar un token a otro usuario', async () => {
      pushDeviceFindUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'dev-1', userId: 'user-2' });
      pushDeviceCreate.mockRejectedValue(prismaKnownError('P2002'));

      await expect(
        service.registerOrUpdate('user-1', 'fcm-token-123', 'android'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(pushDeviceCreate).toHaveBeenCalledTimes(1);
      expect(pushDeviceUpdate).not.toHaveBeenCalled();
    });

    it('permite completar el registro si la carrera UNIQUE la ganó el mismo usuario', async () => {
      pushDeviceFindUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'dev-1', userId: 'user-1' });
      pushDeviceCreate.mockRejectedValue(prismaKnownError('P2002'));
      pushDeviceUpdate.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        token: 'fcm-token-123',
        platform: 'ios',
      });

      await service.registerOrUpdate('user-1', 'fcm-token-123', 'ios');

      expect(pushDeviceUpdate).toHaveBeenCalledWith({
        where: { id: 'dev-1', userId: 'user-1' },
        data: {
          platform: 'ios',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('rechaza el cambio si el dueño cambia entre la lectura y la actualización', async () => {
      pushDeviceFindUnique
        .mockResolvedValueOnce({ id: 'dev-1', userId: 'user-1' })
        .mockResolvedValueOnce({ userId: 'user-2' });
      pushDeviceUpdate.mockRejectedValue(prismaKnownError('P2025'));

      await expect(
        service.registerOrUpdate('user-1', 'fcm-token-123', 'android'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(pushDeviceUpdate).toHaveBeenCalledWith({
        where: { id: 'dev-1', userId: 'user-1' },
        data: {
          platform: 'android',
          updatedAt: expect.any(Date),
        },
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
