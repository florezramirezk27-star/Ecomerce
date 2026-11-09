import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
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
  where: { id: string };
  data: Record<string, unknown>;
};

type DeliveryUpdateManyArgs = {
  where: {
    id: string;
    notificationEventId: string;
    status: { in: string[] };
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
  const executeRaw = jest.fn<
    Promise<number>,
    [TemplateStringsArray, ...unknown[]]
  >();
  const transactionQueryRaw = jest.fn<
    Promise<Array<{ id: string }>>,
    [TemplateStringsArray, ...unknown[]]
  >();
  const transactionExecuteRaw = jest.fn<
    Promise<number>,
    [TemplateStringsArray, ...unknown[]]
  >();
  const transactionDeliveryUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [DeliveryUpdateManyArgs]
  >();
  const transactionEventUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [EventWriteArgs]
  >();
  const transaction = jest.fn<Promise<unknown>, [TransactionCallback]>();
  const findAdminDevices = jest.fn<Promise<AdminDevice[]>, []>();
  const deleteByTokenIfPresent = jest.fn<Promise<number>, [string]>();
  const sendToToken = jest.fn<
    Promise<FcmSendResult>,
    [string, string, string, Record<string, string | number | boolean | null>]
  >();

  // Estado configurable de los mocks de PostgreSQL.
  let eventRowExists = true;
  let eventOwnership = true;
  let recoverCount = 0;
  let renewLeaseCount = 1;

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

  function transactionClient() {
    return {
      $executeRaw: transactionExecuteRaw,
      $queryRaw: transactionQueryRaw,
      notificationDelivery: {
        createMany: notificationDeliveryCreateMany,
        updateMany: transactionDeliveryUpdateMany,
      },
      notificationEvent: {
        updateMany: transactionEventUpdateMany,
      },
    };
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    finalEventWriteCount = 1;
    eventRowExists = true;
    eventOwnership = true;
    recoverCount = 0;
    renewLeaseCount = 1;

    // resetAllMocks borra la implementación de $transaction, así que se
    // vuelve a registrar en cada test. El callback recibe un cliente de
    // transacción con las operaciones que usa withLockedOwnedEvent.
    transaction.mockImplementation((callback) =>
      callback(transactionClient()),
    );

    queryRaw.mockResolvedValue([]);
    // Las transacciones ejecutan primero SELECT ... FOR UPDATE y después la
    // comprobación de propiedad con clock_timestamp(). Los tests pueden
    // simular la pérdida del lock cambiando eventOwnership.
    transactionQueryRaw.mockImplementation((strings) => {
      const sql = strings.join('?');
      if (sql.includes('"lockedBy"')) {
        return Promise.resolve(
          eventRowExists && eventOwnership ? [{ id: 'evt-1' }] : [],
        );
      }
      if (sql.includes('FOR UPDATE')) {
        return Promise.resolve(eventRowExists ? [{ id: 'evt-1' }] : []);
      }
      return Promise.resolve([{ id: 'evt-1' }]);
    });
    transactionExecuteRaw.mockResolvedValue(0);
    transactionDeliveryUpdateMany.mockResolvedValue({ count: 1 });
    transactionEventUpdateMany.mockImplementation(() =>
      Promise.resolve({ count: finalEventWriteCount }),
    );
    executeRaw.mockImplementation((strings) => {
      const sql = strings.join('?');
      if (sql.includes(`SET "status" = 'PENDING'`)) {
        return Promise.resolve(recoverCount);
      }
      if (sql.includes('SET "lockedUntil"')) {
        return Promise.resolve(renewLeaseCount);
      }
      return Promise.resolve(0);
    });
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: PrismaService,
          useValue: {
            notificationEvent: {
              create: notificationEventCreate,
              update: notificationEventUpdate,
            },
            notificationDelivery: {
              count: notificationDeliveryCount,
              createMany: notificationDeliveryCreateMany,
              findMany: notificationDeliveryFindMany,
            },
            $queryRaw: queryRaw,
            $executeRaw: executeRaw,
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
    const call = transactionEventUpdateMany.mock.calls.find(
      ([args]) => 'status' in args.data,
    );
    return call?.[0];
  }

  // Verifica que la entrega con el id dado se actualizó dentro de una
  // transacción que mantenía el lock del evento padre.
  function deliveryUpdateCalledWith(deliveryId: string): boolean {
    return transactionDeliveryUpdateMany.mock.calls.some(
      ([args]) => args.where.id === deliveryId,
    );
  }

  function transactionSql(
    call: [TemplateStringsArray, ...unknown[]] | undefined,
  ): string {
    return call ? call[0].join('?') : '';
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
      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
      const finalCall = finalEventUpdateCall();
      expect(finalCall?.where).toEqual({ id: 'evt-1' });
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
      // La renovación del lease falla (0 filas): la instancia pierde el lock al iniciar.
      renewLeaseCount = 0;

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

      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
      expect(deliveryUpdateCalledWith('del-2')).toBe(true);
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
      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
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

      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
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

      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
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
      recoverCount = 2;

      const recovered = await (
        service as unknown as {
          recoverExpiredLocks: () => Promise<number>;
        }
      ).recoverExpiredLocks();

      expect(recovered).toBe(2);
      const calls = executeRaw.mock.calls.map((c) => c[0].join('?'));
      expect(calls.some((s) => s.includes(`SET "status" = 'PENDING'`))).toBe(
        true,
      );
      expect(
        calls.some((s) => s.includes('"lockedUntil" <= (clock_timestamp()')),
      ).toBe(true);
      const data = executeRaw.mock.calls[0][0];
      expect(data.join('?')).not.toContain('attempts');
    });
  });

  // ========================================================================
  // Nuevas pruebas: protección del lock del evento padre en NotificationDelivery
  // ========================================================================

  describe('protección de entregas por propiedad del lock del evento padre', () => {
    type PushApi = {
      updateDeliveryIfOwned: (
        eventId: string,
        deliveryId: string,
        data: Record<string, unknown>,
      ) => Promise<'UPDATED' | 'NOT_PENDING' | 'LOCK_LOST'>;
      ensureDeliveries: (
        eventId: string,
        devices: { id: string; token: string }[],
      ) => Promise<boolean>;
      assertWritableDeliveryColumns: (
        data: Record<string, unknown>,
      ) => void;
    };

    function api(): PushApi {
      return service as unknown as PushApi;
    }

    function ownedEventDefaults() {
      eventRowExists = true;
      eventOwnership = true;
      queryRaw.mockResolvedValue([event]);
      findAdminDevices.mockResolvedValue([device]);
      notificationDeliveryCount.mockResolvedValue(0);
      sendToToken.mockResolvedValue({
        success: true,
        invalidToken: false,
        retryable: false,
      });
    }

    beforeEach(() => {
      ownedEventDefaults();
    });

    it('1. una instancia propietaria puede adquirir el lock del evento padre', async () => {
      const outcome = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'SENT',
        attempts: 1,
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        nextAttemptAt: null,
        lastError: null,
        firebaseErrorCode: null,
      });
      expect(outcome).toBe('UPDATED');
      const sqls = transactionQueryRaw.mock.calls.map((c) => c[0].join('?'));
      expect(sqls.some((s) => s.includes('FOR UPDATE'))).toBe(true);
      expect(sqls.some((s) => s.includes('"lockedBy"'))).toBe(true);
      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
    });

    it('2. una instancia propietaria puede actualizar una entrega dentro de la transacción', async () => {
      const outcome = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'SENT',
        attempts: 1,
      });
      expect(outcome).toBe('UPDATED');
      expect(deliveryUpdateCalledWith('del-1')).toBe(true);
    });

    it('3. una instancia no propietaria no puede actualizar la entrega (LOCK_LOST)', async () => {
      eventOwnership = false;
      const outcome = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'SENT',
        attempts: 1,
      });
      expect(outcome).toBe('LOCK_LOST');
      expect(deliveryUpdateCalledWith('del-1')).toBe(false);
    });

    it('4. un error de espera por el lock se propaga como error de base de datos (no LOCK_LOST)', async () => {
      transactionQueryRaw.mockImplementationOnce(() =>
        Promise.reject(new Error('canceling statement due to statement timeout')),
      );
      await expect(
        api().updateDeliveryIfOwned('evt-1', 'del-1', {
          status: 'SENT',
          attempts: 1,
        }),
      ).rejects.toThrow();
    });

    it('5. la comprobación del lease usa clock_timestamp() después del FOR UPDATE', async () => {
      const outcome = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'SENT',
        attempts: 1,
      });
      expect(outcome).toBe('UPDATED');
      const sqls = transactionQueryRaw.mock.calls.map((c) => c[0].join('?'));
      const forUpdateIdx = sqls.findIndex((s) => s.includes('FOR UPDATE'));
      const ownershipIdx = sqls.findIndex(
        (s, i) => i > forUpdateIdx && s.includes('"lockedBy"'),
      );
      expect(ownershipIdx).toBeGreaterThan(forUpdateIdx);
      expect(sqls[ownershipIdx]).toContain('clock_timestamp');
    });

    it('6. una entrega SENT no puede convertirse en RETRY (NOT_PENDING)', async () => {
      // La entrega ya está resuelta: el UPDATE afecta cero filas.
      transactionDeliveryUpdateMany.mockResolvedValueOnce({ count: 0 });
      const outcome = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'RETRY',
        attempts: 2,
        nextAttemptAt: new Date(),
        lastError: 'UNAVAILABLE',
      });
      expect(outcome).toBe('NOT_PENDING');
    });

    it('7. una entrega INVALID no puede volver a PENDING (NOT_PENDING)', async () => {
      // La entrega ya está resuelta: el UPDATE afecta cero filas.
      transactionDeliveryUpdateMany.mockResolvedValueOnce({ count: 0 });
      const outcome = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'PENDING',
        attempts: 1,
        nextAttemptAt: new Date(),
      });
      expect(outcome).toBe('NOT_PENDING');
    });

    it('8. un resultado LOCK_LOST detiene el procesamiento sin escribir el evento', async () => {
      eventOwnership = false;
      const result = await service.processPendingEvents();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
      expect(finalEventUpdateCall()).toBeUndefined();
    });

    it('9. un error real de base de datos sigue el manejo de errores de procesamiento', async () => {
      transactionQueryRaw.mockImplementationOnce(() =>
        Promise.reject(new Error('conexión perdida')),
      );
      const result = await service.processPendingEvents();
      // handleProcessingError renueva el lease y vuelve a PENDING mientras siga siendo dueña.
      expect(result.failed).toBe(1);
    });

    it('10. la transacción se libera tras el éxito y tras una excepción', async () => {
      const first = await api().updateDeliveryIfOwned('evt-1', 'del-1', {
        status: 'SENT',
        attempts: 1,
      });
      expect(first).toBe('UPDATED');
      // Transacción liberada: otra escritura sobre el mismo evento funciona.
      const second = await api().updateDeliveryIfOwned('evt-1', 'del-2', {
        status: 'SENT',
        attempts: 1,
      });
      expect(second).toBe('UPDATED');
      expect(transaction).toHaveBeenCalledTimes(2);
    });

    it('11. ensureDeliveries no crea entregas cuando se pierde el lock', async () => {
      eventOwnership = false;
      const created = await api().ensureDeliveries('evt-1', [device]);
      expect(created).toBe(false);
      expect(notificationDeliveryCreateMany).not.toHaveBeenCalled();
    });

    it('12. la lista blanca de columnas rechaza campos no permitidos', async () => {
      expect(() =>
        api().assertWritableDeliveryColumns({
          status: 'SENT',
          columnaInvalida: 'x',
        } as unknown as Prisma.NotificationDeliveryUpdateManyMutationInput),
      ).toThrow('Columna de entrega no permitida: columnaInvalida');
    });
  });
});
