import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDeviceService } from './push-device.service';
import {
  FirebaseMessagingService,
  FcmSendResult,
} from './firebase-messaging.service';

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

type EventWriteArgs = {
  where: {
    id: string;
    lockedBy?: string;
    lockedUntil?: { lt?: Date; gt?: Date };
  };
  data: Record<string, unknown>;
};

type DeliveryCreateManyArgs = {
  data: Array<Record<string, unknown>>;
  skipDuplicates?: boolean;
};

type TransactionCallback = (tx: unknown) => Promise<unknown>;

type AdminDevice = {
  id: string;
  token: string;
  platform: string;
  userId: string;
};

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let prisma: PrismaService;

  const notificationEventCreate = jest.fn<Promise<unknown>, [unknown]>();
  const notificationEventUpdate = jest.fn<Promise<unknown>, [unknown]>();
  const notificationEventUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [EventWriteArgs]
  >();
  const notificationEventFindFirst = jest.fn<
    Promise<{ id: string } | null>,
    [unknown]
  >();
  const notificationDeliveryCount = jest.fn<Promise<number>, [unknown]>();
  const notificationDeliveryCreateMany = jest.fn<
    Promise<{ count: number }>,
    [DeliveryCreateManyArgs]
  >();
  const notificationDeliveryFindMany = jest.fn<
    Promise<Array<Record<string, unknown>>>,
    [unknown]
  >();
  const queryRaw = jest.fn<
    Promise<ClaimedEvent[]>,
    [TemplateStringsArray, ...unknown[]]
  >();
  const queryRawUnsafe = jest.fn<
    Promise<Array<{ id: string }>>,
    [string, ...unknown[]]
  >();
  const transactionQueryRaw = jest.fn<
    Promise<Array<{ id: string }>>,
    [TemplateStringsArray, ...unknown[]]
  >();
  const transaction = jest.fn<Promise<unknown>, [TransactionCallback]>();
  const findAdminDevices = jest.fn<Promise<AdminDevice[]>, []>();
  const deleteByTokenIfPresent = jest.fn<Promise<number>, [string]>();
  const sendToToken = jest.fn<
    Promise<FcmSendResult>,
    [string, string, string, Record<string, string | number | boolean | null>]
  >();

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
    jest.resetAllMocks();
    finalEventWriteCount = 1;

    // resetAllMocks borra la implementación de $transaction, así que se
    // vuelve a registrar en cada test. El callback recibe un cliente de
    // transacción con las operaciones que usa ensureDeliveries.
    transaction.mockImplementation((callback) =>
      callback({
        $queryRaw: transactionQueryRaw,
        notificationDelivery: { createMany: notificationDeliveryCreateMany },
      }),
    );

    queryRaw.mockResolvedValue([]);
    // Por defecto, el SELECT ... FOR UPDATE de ensureDeliveries confirma que
    // el evento sigue bajo nuestro lock.
    transactionQueryRaw.mockResolvedValue([{ id: 'evt-1' }]);
    // Por defecto, $queryRawUnsafe devuelve [{ id }] = una fila afectada.
    queryRawUnsafe.mockResolvedValue([{ id: 'del-1' }]);
    notificationEventCreate.mockResolvedValue({ id: 'evt-1' });
    notificationEventUpdate.mockResolvedValue({});
    notificationDeliveryCount.mockResolvedValue(0);
    notificationDeliveryCreateMany.mockImplementation(({ data }) =>
      Promise.resolve({ count: data.length }),
    );
    notificationDeliveryFindMany.mockResolvedValue([]);
    findAdminDevices.mockResolvedValue([]);
    deleteByTokenIfPresent.mockResolvedValue(1);
    sendToToken.mockResolvedValue({
      success: true,
      invalidToken: false,
      retryable: false,
    });

    // Por defecto, el evento todavía pertenece a esta instancia.
    notificationEventFindFirst.mockResolvedValue({ id: 'evt-1' });

    notificationEventUpdateMany.mockImplementation((args) => {
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
    });

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
              findFirst: notificationEventFindFirst,
            },
            notificationDelivery: {
              count: notificationDeliveryCount,
              createMany: notificationDeliveryCreateMany,
              findMany: notificationDeliveryFindMany,
            },
            $queryRaw: queryRaw,
            $queryRawUnsafe: queryRawUnsafe,
            $transaction: transaction,
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
    (
      service as unknown as { resolvedDeliveries?: Set<string> }
    ).resolvedDeliveries = new Set();
  });

  /**
   * `anyDate()` devuelve `any`; el helper lo estrecha al tipo Date para
   * que el spec pase `@typescript-eslint/no-unsafe-assignment` sin casts
   * dispersos. Sigue siendo el matcher asimétrico de Jest.
   */
  function anyDate(): Date {
    return expect.any(Date) as Date;
  }

  function objectContaining<T extends object>(expected: T): T {
    return expect.objectContaining(expected) as T;
  }

  function finalEventUpdateCall(): EventWriteArgs | undefined {
    const call = notificationEventUpdateMany.mock.calls.find(([args]) => {
      const instanceId = (service as unknown as { instanceId: string })
        .instanceId;
      return args.where.lockedBy === instanceId && 'status' in args.data;
    });
    return call?.[0];
  }

  // Verifica que $queryRawUnsafe fue llamado con el deliveryId dado.
  function queryRawUnsafeCalledWith(deliveryId: string): boolean {
    return queryRawUnsafe.mock.calls.some(([sql, ...values]) => {
      // Los valores se pasan como argumentos sueltos: [sql, ...values, deliveryId, eventId, instanceId, now]
      return (
        sql.includes('"NotificationDelivery"') &&
        values.slice(-4).includes(deliveryId)
      );
    });
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
          nextAttemptAt: anyDate(),
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
        data: objectContaining({
          eventId: 'evt-unique-1',
          type: 'ORDER_CANCELLED',
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: anyDate(),
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
      expect(queryRawUnsafeCalledWith('del-1')).toBe(true);
      const finalCall = finalEventUpdateCall();
      expect(finalCall?.where).toEqual({
        id: 'evt-1',
        status: 'PROCESSING',
        lockedBy: (service as unknown as { instanceId: string }).instanceId,
        lockedUntil: { gt: anyDate() },
      });
      expect(finalCall?.data).toEqual(
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

      expect(queryRawUnsafeCalledWith('del-1')).toBe(true);
      expect(queryRawUnsafeCalledWith('del-2')).toBe(true);
      const finalCall = finalEventUpdateCall();
      expect(finalCall?.data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          nextAttemptAt: anyDate(),
        }),
      );
      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
    });

    it('elimina solo el token UNREGISTERED y conserva el historial', async () => {
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
      expect(queryRawUnsafeCalledWith('del-1')).toBe(true);
      expect(finalEventUpdateCall()?.data).toEqual(
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

      expect(queryRawUnsafeCalledWith('del-1')).toBe(true);
      expect(finalEventUpdateCall()?.data).toEqual(
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

      expect(queryRawUnsafeCalledWith('del-1')).toBe(true);
      expect(result.dead).toBe(1);
    });

    it('marca SKIPPED cuando no hay dispositivos admin', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([]);
      notificationDeliveryFindMany.mockResolvedValueOnce([]);

      const result = await service.processPendingEvents();

      expect(notificationDeliveryCreateMany).not.toHaveBeenCalled();
      expect(finalEventUpdateCall()?.data).toEqual(
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

      const finalCall = finalEventUpdateCall();
      expect(finalCall?.data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          attempts: 1,
          lastError: 'Firebase caído',
          nextAttemptAt: anyDate(),
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

      expect(finalEventUpdateCall()?.data).toEqual(
        expect.objectContaining({
          status: 'DEAD',
          attempts: 5,
          processedAt: anyDate(),
        }),
      );
      expect(result.dead).toBe(1);
    });

    it('calcula nextAttemptAt con backoff exponencial y respeta Retry-After', () => {
      const api = service as unknown as {
        calculateNextAttemptAt: (
          attempts: number,
          retryAfterSeconds?: number,
        ) => Date;
      };

      // El método no usa `this`; invocarlo sobre la vista tipada evita el
      // `any` que produce Function.prototype.bind en este tsconfig.
      const first = api.calculateNextAttemptAt(0);
      const second = api.calculateNextAttemptAt(1);
      const third = api.calculateNextAttemptAt(2);

      expect(second.getTime()).toBeGreaterThan(first.getTime());
      expect(third.getTime()).toBeGreaterThan(second.getTime());

      const withRetryAfter = api.calculateNextAttemptAt(0, 120);
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
          lockedUntil: { lt: anyDate() },
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

  // ========================================================================
  // Nuevas pruebas: protección del lock del evento padre en NotificationDelivery
  // ========================================================================

  describe('protección de entregas por propiedad del lock del evento padre', () => {
    it('1. una instancia propietaria puede crear las entregas', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      notificationEventFindFirst.mockResolvedValue({ id: 'evt-1' });
      // Tras crear las entregas, el worker las encuentra PENDING y las envía.
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
        ]);
      sendToToken.mockResolvedValue({
        success: true,
        invalidToken: false,
        retryable: false,
      });

      const result = await service.processPendingEvents();

      expect(notificationDeliveryCreateMany).toHaveBeenCalled();
      expect(sendToToken).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('2. una instancia que perdió el lock no puede crear entregas', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      // El SELECT ... FOR UPDATE dentro de la transacción no encuentra la fila
      // porque el evento ya no pertenece a esta instancia.
      transactionQueryRaw.mockResolvedValue([]);

      const result = await service.processPendingEvents();

      expect(notificationDeliveryCreateMany).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
    });

    it('3. una instancia propietaria puede actualizar una entrega', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      sendToToken.mockResolvedValue({
        success: true,
        invalidToken: false,
        retryable: false,
      });
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
        ]);

      const result = await service.processPendingEvents();

      expect(queryRawUnsafeCalledWith('del-1')).toBe(true);
      expect(result.sent).toBe(1);
    });

    it('4. una instancia que perdió el lock no puede actualizar una entrega', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      sendToToken.mockResolvedValue({
        success: true,
        invalidToken: false,
        retryable: false,
      });
      // queryRawUnsafe devuelve [] -> NOT_PENDING o LOCK_LOST.
      // notificationEventFindFirst devuelve null -> el evento no es nuestro.
      notificationEventFindFirst.mockResolvedValue(null);
      queryRawUnsafe.mockResolvedValue([]);
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([]);

      const result = await service.processPendingEvents();

      // Se perdió el lock: no se cuenta como enviado ni fallido.
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
    });

    it('5. una entrega SENT no puede cambiar a RETRY', async () => {
      // La entrega ya está resuelta (SENT): updateDeliveryIfOwned devuelve NOT_PENDING.
      const svc = service as unknown as { resolvedDeliveries?: Set<string> };
      svc.resolvedDeliveries = new Set(['del-1']);

      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      sendToToken.mockResolvedValue({
        success: false,
        invalidToken: false,
        retryable: true,
        error: 'UNAVAILABLE',
      });
      // queryRawUnsafe devuelve [] para la entrega resuelta.
      queryRawUnsafe.mockResolvedValue([]);
      notificationEventFindFirst.mockResolvedValue({ id: 'evt-1' }); // Seguimos siendo dueños
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([
          { status: 'SENT', nextAttemptAt: null, lastError: null },
        ]);

      const result = await service.processPendingEvents();

      // La entrega SENT no se sobrescribe: NOT_PENDING, continuar normalmente.
      // El evento se finaliza como SENT porque la entrega ya era SENT.
      expect(result.sent).toBe(1);
    });

    it('6. una entrega INVALID no puede volver a PENDING', async () => {
      const svc = service as unknown as { resolvedDeliveries?: Set<string> };
      svc.resolvedDeliveries = new Set(['del-1']);

      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      sendToToken.mockResolvedValue({
        success: true,
        invalidToken: false,
        retryable: false,
      });
      queryRawUnsafe.mockResolvedValue([]);
      notificationEventFindFirst.mockResolvedValue({ id: 'evt-1' });
      notificationDeliveryFindMany
        .mockResolvedValueOnce([{ ...pendingDelivery(), status: 'INVALID' }])
        .mockResolvedValueOnce([
          { status: 'INVALID', nextAttemptAt: null, lastError: null },
        ]);

      const result = await service.processPendingEvents();

      // La entrega INVALID no se sobrescribe: NOT_PENDING, continuar.
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('7. una pérdida de lock no activa handleProcessingError como error ordinario', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      // Al intentar renovar el lease antes de enviar, falla (0 filas).
      notificationEventUpdateMany.mockImplementationOnce(
        (args: {
          where: { lockedBy?: string; lockedUntil?: { gt?: Date } };
          data: Record<string, unknown>;
        }) => {
          if (args.data.lockedUntil && !('status' in args.data)) {
            return Promise.resolve({ count: 0 });
          }
          return Promise.resolve({ count: 1 });
        },
      );

      const result = await service.processPendingEvents();

      // El resultado debe ser LOCK_LOST, no un error de procesamiento.
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
    });

    it('8. una actualización que afecta cero filas detiene el procesamiento', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      sendToToken.mockResolvedValue({
        success: true,
        invalidToken: false,
        retryable: false,
      });
      // queryRawUnsafe devuelve [] y notificationEventFindFirst devuelve null -> LOCK_LOST.
      queryRawUnsafe.mockResolvedValue([]);
      notificationEventFindFirst.mockResolvedValue(null);
      notificationDeliveryFindMany
        .mockResolvedValueOnce([pendingDelivery()])
        .mockResolvedValueOnce([]);

      const result = await service.processPendingEvents();

      // No debe haber escritura final del evento tras la pérdida de lock.
      expect(result.sent).toBe(0);
      expect(finalEventUpdateCall()).toBeUndefined();
    });

    it('9. una instancia antigua no puede sobrescribir el lock de otra', async () => {
      // Simular que notificationEventUpdateMany devuelve 0 filas porque
      // el lockedBy no coincide (instancia antigua).
      notificationEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 0 }),
      );

      const updated = await (
        service as unknown as {
          writeEventIfOwned: (
            id: string,
            data: Record<string, unknown>,
            now: Date,
          ) => Promise<boolean>;
        }
      ).writeEventIfOwned('evt-1', { status: 'SENT' }, new Date());

      expect(updated).toBe(false);
    });

    it('10. una entrega ya resuelta no vuelve a recibir un envío por el worker', async () => {
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(1);
      // Ya hay entregas: el where de Prisma filtra por PENDING/RETRY, así que
      // una entrega SENT no se devuelve. No hay nada que enviar.
      notificationDeliveryFindMany.mockResolvedValueOnce([]);

      await service.processPendingEvents();

      expect(sendToToken).not.toHaveBeenCalled();
      expect(findAdminDevices).not.toHaveBeenCalled();
    });
  });
});
