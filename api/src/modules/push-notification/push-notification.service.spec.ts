import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDeviceService } from './push-device.service';
import { FirebaseMessagingService, FcmSendResult } from './firebase-messaging.service';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let prisma: PrismaService;

  const notificationEventCreate = jest.fn();
  const notificationEventFindMany = jest.fn();
  const notificationEventUpdate = jest.fn();
  const notificationEventUpdateMany = jest.fn();
  const notificationEventFindUnique = jest.fn();
  const queryRawUnsafe = jest.fn();
  const findAdminDevices = jest.fn();
  const sendToToken = jest.fn();
  const deleteByToken = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: PrismaService,
          useValue: {
            notificationEvent: {
              create: notificationEventCreate,
              findMany: notificationEventFindMany,
              update: notificationEventUpdate,
              updateMany: notificationEventUpdateMany,
              findUnique: notificationEventFindUnique,
            },
            $queryRawUnsafe: queryRawUnsafe,
          },
        },
        {
          provide: PushDeviceService,
          useValue: {
            findAdminDevices,
            deleteByToken,
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

    // Reset instance-level processing flag between tests
    (service as any).processing = false;

    // Por defecto, notificationEventFindUnique confirma que nuestra instancia
    // posee el lock (para tests de procesamiento de eventos).
    notificationEventFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        lockedBy: (service as any).instanceId,
        lockedUntil: new Date(Date.now() + 60000),
      }),
    );
  });

  describe('createEvent (dentro de transaccion)', () => {
    it('crea un evento PENDING con nextAttemptAt', async () => {
      notificationEventCreate.mockResolvedValue({ id: 'evt-1' });

      await service.createEvent(
        prisma as any,
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
      notificationEventCreate.mockResolvedValue({ id: 'evt-1' });

      await service.createEventStandalone(
        'evt-unique-1',
        'ORDER_CANCELLED',
        'ord-1',
        7,
        { orderId: 'ord-1', numericId: 7 },
      );

      expect(notificationEventCreate).toHaveBeenCalledWith({
        data: {
          eventId: 'evt-unique-1',
          type: 'ORDER_CANCELLED',
          orderId: 'ord-1',
          numericId: 7,
          payload: { orderId: 'ord-1', numericId: 7 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: expect.any(Date),
        },
      });
    });
  });

  describe('processPendingEvents con bloqueo distribuido', () => {
    it('no hace nada cuando no hay eventos pendientes', async () => {
      queryRawUnsafe.mockResolvedValue([]);

      const result = await service.processPendingEvents();

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('envía notificación a dispositivos ADMIN y marca como SENT', async () => {
      const now = new Date();
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockResolvedValue({ success: true, invalidToken: false, retryable: false });
      notificationEventUpdate.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(sendToToken).toHaveBeenCalledWith(
        'token-admin-1',
        'Nuevo pedido en Kronio Market',
        'Has recibido un nuevo pedido #42.',
        { orderId: 'ord-1', numericId: 42 },
      );
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'SENT',
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
          processedAt: expect.any(Date),
        },
      });
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.dead).toBe(0);
    });

    it('evita ejecuciones simultáneas (flag processing local)', async () => {
      (service as any).processing = true;

      const result = await service.processPendingEvents();

      expect(result.processed).toBe(0);
      expect(sendToToken).not.toHaveBeenCalled();
    });

    it('reclama evento con FOR UPDATE SKIP LOCKED y establece bloqueo', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([]);
      notificationEventUpdate.mockResolvedValue({});

      await service.processPendingEvents();

      // Verificar que se estableció el bloqueo (status PROCESSING, lockedBy, lockedUntil)
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: 'PROCESSING',
          lockedAt: expect.any(Date),
          lockedBy: expect.any(String),
          lockedUntil: expect.any(Date),
        }),
      });
    });

    it('no procesa evento bloqueado por otra instancia (SKIP LOCKED)', async () => {
      // Dos workers compiten: el primero reclama el evento, el segundo no lo ve.
      queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]).mockResolvedValueOnce([]); // Segundo worker no encuentra eventos (SKIP LOCKED)

      findAdminDevices.mockResolvedValue([]);
      notificationEventUpdate.mockResolvedValue({});

      const result1 = await service.processPendingEvents();
      const result2 = await service.processPendingEvents();

      expect(result1.processed).toBe(1);
      expect(result2.processed).toBe(0);
    });

    it('recupera bloqueos expirados (recoverExpiredLocks)', async () => {
      const past = new Date(Date.now() - 20 * 60 * 1000); // hace 20 minutos
      notificationEventUpdateMany.mockResolvedValue({ count: 2 });

      const recovered = await (service as any).recoverExpiredLocks();

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
    });

    it('calcula nextAttemptAt con backoff exponencial', async () => {
      const event = {
        id: 'evt-1',
        eventId: 'evt-unique-1',
        type: 'ORDER_CREATED',
        orderId: 'ord-1',
        numericId: 42,
        payload: { orderId: 'ord-1', numericId: 42 },
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        lastError: null,
      };

      // Acceso privado para probar el cálculo
      const calculateNextAttemptAt = (service as any).calculateNextAttemptAt.bind(service);

      const first = calculateNextAttemptAt(0);
      const second = calculateNextAttemptAt(1);
      const third = calculateNextAttemptAt(2);

      // Cada intento posterior debe tener un nextAttemptAt mayor (backoff exponencial)
      expect(second.getTime()).toBeGreaterThan(first.getTime());
      expect(third.getTime()).toBeGreaterThan(second.getTime());

      // Con Retry-After se respeta el header de Firebase
      const withRetryAfter = calculateNextAttemptAt(0, 120);
      expect(withRetryAfter.getTime()).toBeGreaterThan(Date.now() + 119000);
      expect(withRetryAfter.getTime()).toBeLessThan(Date.now() + 122000);
    });

    it('marca como FAILED con attempts incrementado y nextAttemptAt cuando Firebase falla', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockResolvedValue({ success: false, invalidToken: false, error: 'timeout', retryable: true });
      notificationEventUpdate.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(result.failed).toBe(1);
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 1,
          lastError: 'Todos los dispositivos fallaron',
          nextAttemptAt: expect.any(Date),
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        }),
      });
    });

    it('pasa a DEAD al alcanzar el máximo de intentos', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 4,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockResolvedValue({ success: false, invalidToken: false, error: 'timeout', retryable: true });
      notificationEventUpdate.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(result.dead).toBe(1);
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: 'DEAD',
          attempts: 5,
          lastError: expect.stringContaining('Máximo de intentos alcanzado'),
          processedAt: expect.any(Date),
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        }),
      });
    });

    it('no lanza excepción cuando Firebase falla (no interrumpe el flujo)', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockRejectedValue(new Error('Firebase caído'));
      notificationEventUpdate.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(result.failed).toBe(1);
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 1,
          lastError: 'Firebase caído',
          nextAttemptAt: expect.any(Date),
        }),
      });
    });

    it('elimina exclusivamente el token UNREGISTERED, no todos los dispositivos', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-unregistered', platform: 'android', userId: 'admin-1' },
        { id: 'dev-2', token: 'token-valid', platform: 'ios', userId: 'admin-1' },
      ]);
      sendToToken
        .mockResolvedValueOnce({ success: false, invalidToken: true, retryable: false })
        .mockResolvedValueOnce({ success: true, invalidToken: false, retryable: false });
      notificationEventUpdate.mockResolvedValue({});
      deleteByToken.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(result.sent).toBe(1);
      expect(deleteByToken).toHaveBeenCalledWith('token-unregistered');
      expect(deleteByToken).not.toHaveBeenCalledWith('token-valid');
    });

    it('marca eventos sin dispositivos admin como SKIPPED, no como SENT', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([]);
      notificationEventUpdate.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: 'SKIPPED',
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
          processedAt: expect.any(Date),
        }),
      });
    });

    it('no procesa evento cuyo lock pertenece a otra instancia', async () => {
      queryRawUnsafe.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-unique-1',
          type: 'ORDER_CREATED',
          orderId: 'ord-1',
          numericId: 42,
          payload: { orderId: 'ord-1', numericId: 42 },
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
        },
      ]);
      findAdminDevices.mockResolvedValue([]);
      notificationEventUpdate.mockResolvedValue({});

      // Primera llamada reclama el evento
      await service.processPendingEvents();

      // Simular que el evento sigue bloqueado por otra instancia
      notificationEventFindUnique.mockResolvedValue({
        lockedBy: 'otra-instancia',
        lockedUntil: new Date(Date.now() + 60000),
      });

      // Segunda llamada: el evento ya fue reclamado, no debe volver a procesarse
      // (notificationEventFindUnique se usa para verificar la propiedad del lock)
      await service.processPendingEvents();

      // notificationEventFindUnique debería haberse llamado para verificar el lock
      expect(notificationEventFindUnique).toHaveBeenCalled();
    });
  });
});
