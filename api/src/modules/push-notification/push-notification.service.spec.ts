import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDeviceService } from './push-device.service';
import { FirebaseMessagingService } from './firebase-messaging.service';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let prisma: PrismaService;

  const notificationEventCreate = jest.fn();
  const notificationEventFindMany = jest.fn();
  const notificationEventUpdate = jest.fn();
  const findAdminDevices = jest.fn();
  const sendToToken = jest.fn();

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
            },
          },
        },
        {
          provide: PushDeviceService,
          useValue: {
            findAdminDevices,
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createEvent (dentro de transaccion)', () => {
    it('crea un evento PENDING con el eventId dado', async () => {
      notificationEventCreate.mockResolvedValue({ id: 'evt-1' });

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
        },
      });
    });
  });

  describe('createEventStandalone (fuera de transaccion)', () => {
    it('crea un evento usando this.prisma', async () => {
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
        },
      });
    });
  });

  describe('processPendingEvents', () => {
    it('no hace nada cuando no hay eventos pendientes', async () => {
      notificationEventFindMany.mockResolvedValue([]);

      const result = await service.processPendingEvents();

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('envia notificacion a dispositivos ADMIN y marca como SENT', async () => {
      notificationEventFindMany.mockResolvedValue([
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
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockResolvedValue({ success: true, invalidToken: false });
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
        data: { status: 'SENT', processedAt: expect.any(Date) },
      });
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('no envia notificaciones duplicadas para el mismo eventId', async () => {
      // Un evento ya SENT no entra en el filtro de PENDING de Prisma.
      // El mock devuelve vacio porque en la BD real el filtro lo excluye.
      notificationEventFindMany.mockResolvedValue([]);

      const result = await service.processPendingEvents();

      expect(result.processed).toBe(0);
      expect(sendToToken).not.toHaveBeenCalled();
    });

    it('marca como FAILED cuando Firebase falla en todos los dispositivos', async () => {
      notificationEventFindMany.mockResolvedValue([
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
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockResolvedValue({ success: false, invalidToken: false, error: 'timeout' });
      notificationEventUpdate.mockResolvedValue({});

      const result = await service.processPendingEvents();

      expect(result.failed).toBe(1);
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: 'Todos los dispositivos fallaron',
        },
      });
    });

    it('no lanza excepcion cuando Firebase falla (error no interrumpe)', async () => {
      notificationEventFindMany.mockResolvedValue([
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
        },
      ]);
      findAdminDevices.mockResolvedValue([
        { id: 'dev-1', token: 'token-admin-1', platform: 'android', userId: 'admin-1' },
      ]);
      sendToToken.mockRejectedValue(new Error('Firebase caído'));
      notificationEventUpdate.mockResolvedValue({});

      // No debe lanzar
      const result = await service.processPendingEvents();

      expect(result.failed).toBe(1);
      expect(notificationEventUpdate).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: 'Firebase caído',
        }),
      });
    });
  });
});
