import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDeviceService } from './push-device.service';
import { FirebaseMessagingService } from './firebase-messaging.service';

type ClaimedEvent = {
  id: string;
  eventId: string;
  type: string;
  orderId: string;
  numericId: number;
  payload: { orderId: string; numericId: number };
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
};

type PendingDelivery = {
  id: string;
  deviceId: string;
  attempts: number;
  status: string;
  nextAttemptAt: Date | null;
  device: { id: string; token: string } | null;
};

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let prisma: PrismaService;

  const notificationEventCreate = jest.fn();
  const notificationEventUpdate = jest.fn();
  const notificationEventUpdateMany = jest.fn();
  const notificationDeliveryCount = jest.fn();
  const notificationDeliveryCreateMany = jest.fn();
  const notificationDeliveryFindMany = jest.fn();
  const notificationDeliveryUpdateMany = jest.fn();
  const queryRaw = jest.fn();
  const findAdminDevices = jest.fn();
  const deleteByTokenIfPresent = jest.fn();
  const sendToToken = jest.fn();

  // Resultado de la escritura final del evento. Los tests de lock perdido lo
  // ponen en 0 para simular que otra instancia es la dueña.
  let finalEventWriteCount = 1;

  const event: ClaimedEvent = {
    id: 'evt-1',
    eventId: 'order-created-ord-1',
    type: 'ORDER_CREATED',
    orderId: 'ord-1',
    numericId: 42,
    payload: { orderId: 'ord-1', numericId: 42 },
    status: 'PROCESSING',
    attempts: 0,
    maxAttempts: 5,
    lastError: null,
  };

  const device = {
    id: 'dev-1',
    token: 'token-admin-1',
    platform: 'android',
    userId: 'admin-1',
  };

  const pendingDelivery = (
    overrides: Partial<PendingDelivery> = {},
  ): PendingDelivery => ({
    id: 'del-1',
    deviceId: device.id,
    attempts: 0,
    status: 'PENDING',
    nextAttemptAt: new Date(),
    device: { id: device.id, token: device.token },
    ...overrides,
  });

  beforeEach(async () => {
    // resetAllMocks (no clearAllMocks) también descarta las colas de
    // mockResolvedValueOnce que un test anterior pudo dejar sin consumir.
    jest.resetAllMocks();
    finalEventWriteCount = 1;

    queryRaw.mockResolvedValue([]);
    notificationEventCreate.mockResolvedValue({ id: 'evt-1' });
    notificationEventUpdate.mockResolvedValue({});
    notificationDeliveryCount.mockResolvedValue(0);
    notificationDeliveryCreateMany.mockImplementation(
      ({ data }: { data: unknown[] }) =>
        Promise.resolve({ count: Array.isArray(data) ? data.length : 0 }),
    );
    notificationDeliveryFindMany.mockResolvedValue([]);
    notificationDeliveryUpdateMany.mockResolvedValue({ count: 1 });
    findAdminDevices.mockResolvedValue([]);
    deleteByTokenIfPresent.mockResolvedValue(1);
    sendToToken.mockResolvedValue({
      success: true,
      invalidToken: false,
      retryable: false,
    });

    notificationEventUpdateMany.mockImplementation(
      (args: {
        where: {
          id: string;
          lockedBy?: string;
          lockedUntil?: { lt?: Date; gt?: Date };
        };
        data: Record<string, unknown>;
      }) => {
        const instanceId = (service as unknown as { instanceId: string })
          .instanceId;

        // Recuperación de locks expirados: no es una escritura final.
        if (
          args.where.lockedUntil?.lt &&
          args.data.status === 'PENDING' &&
          args.data.lockedBy === null &&
          !('nextAttemptAt' in args.data)
        ) {
          return Promise.resolve({ count: 0 });
        }

        // Escritura final: exige status PROCESSING + lockedBy de esta
        // instancia. El test puede simular que el lock ya no nos pertenece.
        if (args.where.lockedBy === instanceId) {
          if ('status' in args.data) {
            return Promise.resolve({ count: finalEventWriteCount });
          }
          // Renovación del lease.
          return Promise.resolve({ count: 1 });
        }

        return Promise.resolve({ count: 1 });
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: PrismaService,
          useValue: {
            notificationEvent: {
              create: notificationEventCreate,
              update: notificationEventUpdate,
              updateMany: notificationEventUpdateMany,
            },
            notificationDelivery: {
              count: notificationDeliveryCount,
              createMany: notificationDeliveryCreateMany,
              findMany: notificationDeliveryFindMany,
              updateMany: notificationDeliveryUpdateMany,
            },
            $queryRaw: queryRaw,
          },
        },
        {
          provide: PushDeviceService,
          useValue: {
            findAdminDevices,
            deleteByTokenIfPresent,
          },
        },
        {
          provide: FirebaseMessagingService,
          useValue: {
            sendToToken,
            isConfigured: true,
          },
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
    prisma = module.get<PrismaService>(PrismaService);
    (service as unknown as { processing: boolean }).processing = false;
  });

  function finalEventUpdateCall() {
    return notificationEventUpdateMany.mock.calls.find(([args]) => {
      const instanceId = (service as unknown as { instanceId: string })
        .instanceId;
      return (
        args?.where?.lockedBy === instanceId &&
        args?.data &&
        typeof args.data === 'object' &&
        'status' in args.data
      );
    });
  }

  function deliveryUpdateCall(deliveryId: string) {
    return notificationDeliveryUpdateMany.mock.calls.find(
      ([args]) => args?.where?.id === deliveryId,
    );
  }

  describe('createEvent (dentro de transaccion)', () => {
    it('crea un evento PENDING con nextAttemptAt', async () => {
      await service.createEvent(
        prisma,
        'order-created-abc-123',
        'ORDER_CREATED',
        'ord-1',
        42,
        { orderId: 'ord-1', numericId: 42 },
      );

      expect(notificationEventCreate).toHaveBeenCalledWith({
        data: {
          eventId: 'order-created-abc-123',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: expect.any(Date),
        },
      });
    });
  });

  describe('createEventStandalone (fuera de transaccion)', () => {
    it('crea un evento usando this.prisma con nextAttemptAt', async () => {
      await service.createEventStandalone(
        'evt-unique-1',
        'ORDER_CANCELLED',
        'ord-1',
        7,
        { orderId: 'ord-1', numericId: 7 },
      );

      expect(notificationEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt-unique-1',
          type: 'ORDER_CANCELLED',
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: expect.any(Date),
        }),
      });
    });
  });

  describe('CTE de reclamo atomico', () => {
    it('no hace nada cuando no hay eventos pendientes', async () => {
      const result = await service.processPendingEvents();

      expect(result).toEqual({
        processed: 0,
        sent: 0,
        failed: 0,
        dead: 0,
        skipped: 0,
      });
    });

    it('entrecomilla todos los identificadores camelCase y usa SKIP LOCKED', async () => {
      await service.processPendingEvents();

      expect(queryRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = queryRaw.mock.calls[0];
      const sql = (strings as string[]).join('?');

      expect(sql).toContain('WITH "claimed" AS (');
      expect(sql).toContain('"e"."nextAttemptAt"');
      expect(sql).toContain('"e"."lockedUntil"');
      expect(sql).toContain('"lockedAt"');
      expect(sql).toContain('"lockedBy"');
      expect(sql).toContain('"createdAt"');
      expect(sql).toContain('"e"."eventId"');
      expect(sql).toContain('"e"."numericId"');
      expect(sql).toContain('"e"."orderId"');
      expect(sql).toContain('"e"."maxAttempts"');
      expect(sql).toContain('"e"."lastError"');
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      // Las columnas son TIMESTAMP(3) sin zona; el parámetro Date llega como
      // timestamptz y debe convertirse a UTC para comparar correctamente.
      expect(sql).toContain("AT TIME ZONE 'UTC'");
      expect(sql).toContain('SET "status" = \'PROCESSING\'');
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('RETURNING');
      expect(values).toContain(
        (service as unknown as { instanceId: string }).instanceId,
      );
    });

    it('marca SENT cuando Firebase entrega a todos los dispositivos', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
        ]);

      const result = await service.processPendingEvents();

      expect(sendToToken).toHaveBeenCalledWith(
        'token-admin-1',
        'Nuevo pedido en Kronio Market',
        'Has recibido un nuevo pedido #42.',
        { orderId: 'ord-1', numericId: 42 },
      );
      expect(notificationDeliveryUpdateMany).toHaveBeenCalledWith({
        where: { id: 'del-1', status: { in: ['PENDING', 'RETRY'] } },
        data: expect.objectContaining({ status: 'SENT' }),
      });
      const finalCall = finalEventUpdateCall();
      expect(finalCall?.[0].where).toEqual({
        id: 'evt-1',
        status: 'PROCESSING',
        lockedBy: (service as unknown as { instanceId: string }).instanceId,
        lockedUntil: { gt: expect.any(Date) },
      });
      expect(finalCall?.[0].data).toEqual(
        expect.objectContaining({
          status: 'SENT',
          attempts: 1,
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        }),
      );
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('no procesa cuando otra instancia ya tiene el lock', async () => {
      queryRaw.mockResolvedValue([]);

      const result = await service.processPendingEvents();

      expect(result.processed).toBe(0);
      expect(findAdminDevices).not.toHaveBeenCalled();
      expect(sendToToken).not.toHaveBeenCalled();
    });

    it('evita ejecuciones simultáneas (flag processing local)', async () => {
      (service as unknown as { processing: boolean }).processing = true;

      const result = await service.processPendingEvents();

      expect(result.processed).toBe(0);
      expect(queryRaw).not.toHaveBeenCalled();
      expect(sendToToken).not.toHaveBeenCalled();
    });
  });

  describe('propiedad del lock en escrituras finales', () => {
    it('si el lease se pierde al inicio, no envía ni escribe', async () => {
      queryRaw.mockResolvedValue([event]);
      notificationEventUpdateMany.mockImplementation(
        (args: {
          where: { lockedBy?: string };
          data: Record<string, unknown>;
        }) => {
          if (args.data.lockedUntil && !('status' in args.data)) {
            return Promise.resolve({ count: 0 });
          }
          return Promise.resolve({ count: 1 });
        },
      );

      const result = await service.processPendingEvents();

      expect(findAdminDevices).not.toHaveBeenCalled();
      expect(sendToToken).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('si la escritura final afecta cero filas, no cuenta el evento como enviado', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
        ]);
      finalEventWriteCount = 0;

      const result = await service.processPendingEvents();

      expect(sendToToken).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  describe('entrega por dispositivo', () => {
    it('en entrega parcial solo deja pendiente el dispositivo que falló', async () => {
      const secondDevice = {
        id: 'dev-2',
        token: 'token-admin-2',
        platform: 'android',
        userId: 'admin-1',
      };

      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device, secondDevice]);
      sendToToken
        .mockResolvedValueOnce({
          success: true,
          invalidToken: false,
          retryable: false,
        })
        .mockResolvedValueOnce({
          success: false,
          invalidToken: false,
          retryable: true,
          error: 'UNAVAILABLE',
          firebaseErrorCode: 'UNAVAILABLE',
        });
      notificationDeliveryFindMany
        .mockResolvedValueOnce([
          pendingDelivery(),
          pendingDelivery({
            id: 'del-2',
            deviceId: 'dev-2',
            device: { id: 'dev-2', token: 'token-admin-2' },
          }),
        ])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
          {
            status: 'RETRY',
            nextAttemptAt: new Date(Date.now() + 60_000),
            lastError: 'UNAVAILABLE',
          },
        ]);

      const result = await service.processPendingEvents();

      expect(deliveryUpdateCall('del-1')?.[0].data).toEqual(
        expect.objectContaining({ status: 'SENT' }),
      );
      expect(deliveryUpdateCall('del-2')?.[0].data).toEqual(
        expect.objectContaining({
          status: 'RETRY',
          nextAttemptAt: expect.any(Date),
        }),
      );
      const finalCall = finalEventUpdateCall();
      expect(finalCall?.[0].data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          nextAttemptAt: expect.any(Date),
        }),
      );
      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
    });

    it('elimina solo el token UNREGISTERED y conserva la entrega INVALID', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      sendToToken.mockResolvedValue({
        success: false,
        invalidToken: true,
        retryable: false,
        firebaseErrorCode: 'UNREGISTERED',
      });
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          { status: 'INVALID', nextAttemptAt: null, lastError: 'UNREGISTERED' },
        ]);

      const result = await service.processPendingEvents();

      expect(deleteByTokenIfPresent).toHaveBeenCalledWith('token-admin-1');
      expect(deliveryUpdateCall('del-1')?.[0].data).toEqual(
        expect.objectContaining({ status: 'INVALID' }),
      );
      expect(finalEventUpdateCall()?.[0].data).toEqual(
        expect.objectContaining({ status: 'SKIPPED' }),
      );
      expect(result.skipped).toBe(1);
    });

    it('un error permanente deja la entrega DEAD sin reintentos', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      sendToToken.mockResolvedValue({
        success: false,
        invalidToken: false,
        retryable: false,
        firebaseErrorCode: 'INVALID_ARGUMENT',
      });
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          {
            status: 'DEAD',
            nextAttemptAt: null,
            lastError: 'INVALID_ARGUMENT',
          },
        ]);

      const result = await service.processPendingEvents();

      const data = deliveryUpdateCall('del-1')?.[0].data;
      expect(data).toEqual(
        expect.objectContaining({ status: 'DEAD', nextAttemptAt: null }),
      );
      expect(finalEventUpdateCall()?.[0].data).toEqual(
        expect.objectContaining({ status: 'DEAD' }),
      );
      expect(result.dead).toBe(1);
    });

    it('un error temporal en el último intento deja la entrega DEAD', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      sendToToken.mockResolvedValue({
        success: false,
        invalidToken: false,
        retryable: true,
        error: 'UNAVAILABLE',
      });
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery({ attempts: 4 })])
        .mockResolvedValueOnce([
          { status: 'DEAD', nextAttemptAt: null, lastError: 'UNAVAILABLE' },
        ]);

      const result = await service.processPendingEvents();

      expect(deliveryUpdateCall('del-1')?.[0].data).toEqual(
        expect.objectContaining({ status: 'DEAD', attempts: 5 }),
      );
      expect(result.dead).toBe(1);
    });

    it('marca SKIPPED cuando no hay dispositivos admin', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([]);
      notificationDeliveryFindMany.mockResolvedValueOnce([]);

      const result = await service.processPendingEvents();

      expect(notificationDeliveryCreateMany).not.toHaveBeenCalled();
      expect(finalEventUpdateCall()?.[0].data).toEqual(
        expect.objectContaining({
          status: 'SKIPPED',
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        }),
      );
      expect(result.skipped).toBe(1);
    });

    it('no envía a dispositivos nuevos en reintentos de un evento antiguo', async () => {
      queryRaw.mockResolvedValue([event]);
      // Ya existen entregas: el worker no debe consultar ni añadir el
      // dispositivo nuevo que se registró después del primer intento.
      notificationDeliveryCount.mockResolvedValue(1);
      notificationDeliveryFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
        ]);

      await service.processPendingEvents();

      expect(findAdminDevices).not.toHaveBeenCalled();
      expect(notificationDeliveryCreateMany).not.toHaveBeenCalled();
    });
  });

  describe('errores inesperados y reintentos', () => {
    it('no lanza excepción cuando Firebase falla (no interrumpe el flujo)', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      sendToToken.mockRejectedValue(new Error('Firebase caído'));
      notificationDeliveryCount.mockResolvedValue(1);
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([]);

      const result = await service.processPendingEvents();

      // El error se captura en processClaimedEvent y el evento vuelve a
      // PENDING con backoff, sin propagar la excepción.
      const finalCall = finalEventUpdateCall();
      expect(finalCall?.[0].data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          attempts: 1,
          lastError: 'Firebase caído',
          nextAttemptAt: expect.any(Date),
        }),
      );
      expect(result.failed).toBe(1);
    });

    it('pasa a DEAD al alcanzar el máximo de intentos ante un error', async () => {
      queryRaw.mockResolvedValue([{ ...event, attempts: 4 }]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(1);
      notificationDeliveryFindMany.mockResolvedValueOnce([pendingDelivery()]);
      sendToToken.mockRejectedValue(new Error('timeout'));

      const result = await service.processPendingEvents();

      expect(finalEventUpdateCall()?.[0].data).toEqual(
        expect.objectContaining({
          status: 'DEAD',
          attempts: 5,
          processedAt: expect.any(Date),
        }),
      );
      expect(result.dead).toBe(1);
    });

    it('calcula nextAttemptAt con backoff exponencial y respeta Retry-After', () => {
      const calculateNextAttemptAt = (
        service as unknown as {
          calculateNextAttemptAt: (
            attempts: number,
            retryAfterSeconds?: number,
          ) => Date;
        }
      ).calculateNextAttemptAt.bind(service);

      const first = calculateNextAttemptAt(0);
      const second = calculateNextAttemptAt(1);
      const third = calculateNextAttemptAt(2);

      expect(second.getTime()).toBeGreaterThan(first.getTime());
      expect(third.getTime()).toBeGreaterThan(second.getTime());

      const withRetryAfter = calculateNextAttemptAt(0, 120);
      expect(withRetryAfter.getTime()).toBeGreaterThan(Date.now() + 119000);
      expect(withRetryAfter.getTime()).toBeLessThan(Date.now() + 122000);
    });
  });

  describe('recoverExpiredLocks', () => {
    it('solo recupera PROCESSING con lockedUntil expirado y conserva intentos', async () => {
      notificationEventUpdateMany.mockResolvedValue({ count: 2 });

      const recovered = await (
        service as unknown as {
          recoverExpiredLocks: () => Promise<number>;
        }
      ).recoverExpiredLocks();

      expect(recovered).toBe(2);
      expect(notificationEventUpdateMany).toHaveBeenCalledWith({
        where: {
          status: 'PROCESSING',
          lockedUntil: { lt: expect.any(Date) },
        },
        data: {
          status: 'PENDING',
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        },
      });
      const data = notificationEventUpdateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('attempts');
    });
  });
});
