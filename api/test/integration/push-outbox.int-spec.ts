import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PushNotificationService } from '../../src/modules/push-notification/push-notification.service';
import { PushDeviceService } from '../../src/modules/push-notification/push-device.service';
import {
  FirebaseMessagingService,
  FcmSendResult,
} from '../../src/modules/push-notification/firebase-messaging.service';

/**
 * Pruebas de integración reales contra PostgreSQL.
 *
 * No se permite apuntar a Neon ni a ninguna base remota: el nombre de la base
 * debe contener "test" y el host debe ser local. CI levanta un servicio
 * PostgreSQL temporal y ejecuta `prisma migrate deploy` antes de esta suite.
 */
const rawDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (!rawDatabaseUrl) {
  throw new Error(
    'INTEGRATION_DATABASE_URL no está definida. Usa una base PostgreSQL temporal, nunca Neon.',
  );
}

const parsedDatabaseUrl = new URL(rawDatabaseUrl);
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, '');

if (!localHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error(
    'Las pruebas de integración solo pueden ejecutarse contra PostgreSQL local.',
  );
}

if (!/test/i.test(databaseName)) {
  throw new Error(
    'El nombre de la base de integración debe contener "test" para evitar borrar datos reales.',
  );
}

// PrismaService lee DATABASE_URL al construirse. Se fuerza la base temporal
// para que ningún `.env` local pueda redirigir las pruebas a Neon.
process.env.DATABASE_URL = rawDatabaseUrl;
process.env.DIRECT_URL = rawDatabaseUrl;

type SendHandler = (
  token: string,
  title: string,
  body: string,
  data?: Record<string, string | number | boolean | null>,
) => FcmSendResult | Promise<FcmSendResult>;

function success(): FcmSendResult {
  return { success: true, invalidToken: false, retryable: false };
}

function makeFakeFcm(handler: SendHandler = () => success()) {
  return {
    sendToToken: handler,
    isConfigured: true,
  } as unknown as FirebaseMessagingService;
}

function makeService(
  prisma: PrismaService,
  handler?: SendHandler,
): PushNotificationService {
  return new PushNotificationService(
    prisma,
    new PushDeviceService(prisma),
    makeFakeFcm(handler),
  );
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Acceso controlado a métodos privados del worker para probar las garantías
 * de propiedad del lock sin depender de tiempos ni de llamadas a FCM.
 */
type PushNotificationInternals = {
  instanceId: string;
  claimPendingEvents: (now: Date) => Promise<
    Array<{
      id: string;
      eventId: string;
      attempts: number;
      maxAttempts: number;
    }>
  >;
  ensureDeliveries: (
    eventId: string,
    devices: Awaited<ReturnType<PushDeviceService['findAdminDevices']>>,
  ) => Promise<boolean>;
  updateDeliveryIfOwned: (
    eventId: string,
    deliveryId: string,
    data: Prisma.NotificationDeliveryUpdateManyMutationInput,
  ) => Promise<'UPDATED' | 'NOT_PENDING' | 'LOCK_LOST'>;
  withLockedOwnedEvent: (
    eventId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) => Promise<{ owned: boolean; value: unknown }>;
};

function internals(
  service: PushNotificationService,
): PushNotificationInternals {
  return service as unknown as PushNotificationInternals;
}

/**
 * Fuerza un lock vigente de otra instancia sobre el evento. Simula que B
 * recuperó el evento después de que A perdiera el lease.
 */
async function forceLockOwnership(
  prisma: PrismaService,
  eventId: string,
  lockedBy: string,
) {
  return prisma.notificationEvent.update({
    where: { id: eventId },
    data: {
      status: 'PROCESSING',
      lockedAt: new Date(),
      lockedBy,
      lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
}

describe('Push outbox contra PostgreSQL real', () => {
  let prismaA: PrismaService;
  let prismaB: PrismaService;
  let adminId: string;

  beforeAll(async () => {
    prismaA = new PrismaService();
    prismaB = new PrismaService();
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  beforeEach(async () => {
    await prismaA.$executeRawUnsafe(
      'TRUNCATE TABLE "NotificationDelivery", "NotificationEvent", "PushDevice", "Order", "User" RESTART IDENTITY CASCADE',
    );

    const admin = await prismaA.user.create({
      data: {
        name: 'Admin de pruebas',
        email: 'admin-integration@test.local',
        role: 'ADMIN',
      },
      select: { id: true },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
  });

  async function createDevice(prisma: PrismaService, token: string) {
    return prisma.pushDevice.create({
      data: {
        userId: adminId,
        token,
        platform: 'android',
      },
      select: { id: true, token: true },
    });
  }

  async function createOrderAndEvent(
    service: PushNotificationService,
    prisma: PrismaService,
    eventId: string,
    maxAttempts?: number,
  ) {
    const order = await prisma.order.create({
      data: { total: 100_000 },
      select: { id: true, numericId: true },
    });

    await service.createEventStandalone(
      eventId,
      'ORDER_CREATED',
      order.id,
      order.numericId,
      {
        orderId: order.id,
        numericId: order.numericId,
        targetStatus: 'PENDING',
      },
    );

    const created = await prisma.notificationEvent.findUniqueOrThrow({
      where: { eventId },
    });

    const event =
      maxAttempts === undefined
        ? created
        : await prisma.notificationEvent.update({
            where: { id: created.id },
            data: { maxAttempts },
          });

    return { order, event };
  }

  it('Prueba A: el CTE real reclama y entrega un evento PENDING', async () => {
    await createDevice(prismaA, 'token-a');
    const service = makeService(prismaA);
    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-a',
    );

    const result = await service.processPendingEvents();

    expect(result).toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
      dead: 0,
      skipped: 0,
    });

    const saved = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe('SENT');
    expect(saved.attempts).toBe(1);
    expect(saved.lockedAt).toBeNull();
    expect(saved.lockedBy).toBeNull();
    expect(saved.lockedUntil).toBeNull();
    expect(saved.nextAttemptAt).toBeNull();

    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id },
    });
    expect(delivery.status).toBe('SENT');
    expect(delivery.attempts).toBe(1);
    expect(delivery.deliveredAt).toBeInstanceOf(Date);
  });

  it('Prueba A2: sin dispositivos admin el evento queda SKIPPED', async () => {
    const service = makeService(prismaA);
    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-a2',
    );

    const result = await service.processPendingEvents();

    expect(result.skipped).toBe(1);
    const saved = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe('SKIPPED');
    expect(
      await prismaA.notificationDelivery.count({
        where: { notificationEventId: event.id },
      }),
    ).toBe(0);
  });

  it('Prueba B: dos workers con conexiones distintas no procesan el mismo evento', async () => {
    await createDevice(prismaA, 'token-b');

    const sendStarted = deferred();
    const releaseSend = deferred();
    let sendsA = 0;

    const serviceA = makeService(prismaA, async () => {
      sendsA++;
      sendStarted.resolve();
      await releaseSend.promise;
      return success();
    });
    const serviceB = makeService(prismaB);

    await createOrderAndEvent(serviceA, prismaA, 'order-created-b');

    const processingA = serviceA.processPendingEvents();
    await sendStarted.promise;

    // B compite mientras A todavía tiene el lease vigente.
    const resultB = await serviceB.processPendingEvents();
    expect(resultB.processed).toBe(0);
    expect(resultB.sent).toBe(0);

    releaseSend.resolve();
    const resultA = await processingA;

    expect(resultA.processed).toBe(1);
    expect(resultA.sent).toBe(1);
    expect(sendsA).toBe(1);
  });

  it('Prueba C: un lock vigente de otra instancia no se reclama', async () => {
    const service = makeService(prismaA);
    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-c',
    );

    await prismaA.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        lockedBy: 'instance-other',
        lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const result = await service.processPendingEvents();

    expect(result.processed).toBe(0);
    const saved = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe('PROCESSING');
    expect(saved.lockedBy).toBe('instance-other');
  });

  it('Prueba D: un lock expirado se recupera y conserva los intentos', async () => {
    await createDevice(prismaA, 'token-d');
    const service = makeService(prismaA);
    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-d',
    );

    await prismaA.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROCESSING',
        attempts: 2,
        lockedAt: new Date(Date.now() - 20 * 60 * 1000),
        lockedBy: 'instance-crashed',
        lockedUntil: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    const recovered = await service.recoverExpiredLocks();
    expect(recovered).toBe(1);

    const afterRecovery = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(afterRecovery.status).toBe('PENDING');
    expect(afterRecovery.attempts).toBe(2);
    expect(afterRecovery.lockedAt).toBeNull();
    expect(afterRecovery.lockedBy).toBeNull();
    expect(afterRecovery.lockedUntil).toBeNull();

    const result = await service.processPendingEvents();
    expect(result.sent).toBe(1);

    const finalEvent = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(finalEvent.status).toBe('SENT');
    // El intento recuperado no reinicia el contador: 2 + el intento actual.
    expect(finalEvent.attempts).toBe(3);
  });

  it('Prueba E: una instancia que perdió el lock no puede sobrescribir el evento', async () => {
    await createDevice(prismaA, 'token-e');

    const sendStarted = deferred();
    const releaseSend = deferred();
    const serviceA = makeService(prismaA, async () => {
      sendStarted.resolve();
      await releaseSend.promise;
      return success();
    });

    const { event } = await createOrderAndEvent(
      serviceA,
      prismaA,
      'order-created-e',
    );

    const processing = serviceA.processPendingEvents();
    await sendStarted.promise;

    // La instancia B recupera el lock mientras A sigue en el envío.
    await prismaB.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        lockedBy: 'instance-b',
        lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    releaseSend.resolve();
    const result = await processing;

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.dead).toBe(0);
    expect(result.skipped).toBe(0);

    const saved = await prismaB.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe('PROCESSING');
    expect(saved.lockedBy).toBe('instance-b');
    expect(saved.attempts).toBe(0);
  });

  it('Prueba F: la entrega parcial solo reintenta al dispositivo que falló', async () => {
    const deviceA = await createDevice(prismaA, 'token-f-a');
    const deviceB = await createDevice(prismaA, 'token-f-b');

    const calls: string[] = [];
    let attemptsB = 0;

    const service = makeService(prismaA, (token) => {
      calls.push(token);

      if (token === 'token-f-b') {
        attemptsB++;
        if (attemptsB === 1) {
          return {
            success: false,
            invalidToken: false,
            retryable: true,
            error: 'UNAVAILABLE',
            firebaseErrorCode: 'UNAVAILABLE',
          };
        }
      }

      return success();
    });

    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-f',
    );

    const first = await service.processPendingEvents();
    expect(first.failed).toBe(1);
    expect(first.sent).toBe(0);

    const afterFirst = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(afterFirst.status).toBe('PENDING');
    expect(afterFirst.attempts).toBe(1);

    const deliveries = await prismaA.notificationDelivery.findMany({
      where: { notificationEventId: event.id },
    });
    const deliveryA = deliveries.find(
      (delivery) => delivery.deviceId === deviceA.id,
    );
    const deliveryB = deliveries.find(
      (delivery) => delivery.deviceId === deviceB.id,
    );

    expect(deliveryA?.status).toBe('SENT');
    expect(deliveryB?.status).toBe('RETRY');
    expect(deliveryB?.nextAttemptAt).toBeInstanceOf(Date);

    // Simular que venció el backoff.
    await prismaA.notificationEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await prismaA.notificationDelivery.update({
      where: { id: deliveryB!.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    const second = await service.processPendingEvents();
    expect(second.sent).toBe(1);

    // El dispositivo que ya había recibido no vuelve a recibir nada.
    expect(calls.filter((token) => token === 'token-f-a')).toHaveLength(1);
    expect(calls.filter((token) => token === 'token-f-b')).toHaveLength(2);

    const finalEvent = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(finalEvent.status).toBe('SENT');

    const finalDeliveries = await prismaA.notificationDelivery.findMany({
      where: { notificationEventId: event.id },
    });
    expect(
      finalDeliveries.every((delivery) => delivery.status === 'SENT'),
    ).toBe(true);
  });

  it('Prueba G: un token UNREGISTERED se elimina y conserva el historial', async () => {
    const device = await createDevice(prismaA, 'token-g-invalid');

    const service = makeService(prismaA, () => ({
      success: false,
      invalidToken: true,
      retryable: false,
      firebaseErrorCode: 'UNREGISTERED',
      fcmErrorCode: 'UNREGISTERED',
    }));

    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-g',
    );

    const result = await service.processPendingEvents();
    expect(result.skipped).toBe(1);

    expect(
      await prismaA.pushDevice.findUnique({ where: { token: device.token } }),
    ).toBeNull();

    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id },
    });
    expect(delivery.status).toBe('INVALID');
    expect(delivery.deviceId).toBeNull();
    expect(delivery.recipientKey).toHaveLength(64);

    const saved = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe('SKIPPED');
    expect(saved.nextAttemptAt).toBeNull();

    // No hay reintentos infinitos para un token inválido.
    const again = await service.processPendingEvents();
    expect(again.processed).toBe(0);
  });

  it('Prueba H: un error permanente queda DEAD y no se reintenta', async () => {
    await createDevice(prismaA, 'token-h');
    let sends = 0;

    const service = makeService(prismaA, () => {
      sends++;
      return {
        success: false,
        invalidToken: false,
        retryable: false,
        error: 'Invalid payload',
        firebaseErrorCode: 'INVALID_ARGUMENT',
        fcmErrorCode: 'INVALID_ARGUMENT',
      };
    });

    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-h',
    );

    const result = await service.processPendingEvents();
    expect(result.dead).toBe(1);

    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id },
    });
    expect(delivery.status).toBe('DEAD');
    expect(delivery.nextAttemptAt).toBeNull();
    expect(delivery.lastError).toContain('INVALID_ARGUMENT');

    const saved = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe('DEAD');
    expect(saved.nextAttemptAt).toBeNull();

    const again = await service.processPendingEvents();
    expect(again.processed).toBe(0);
    expect(sends).toBe(1);
  });

  it('Prueba I: si falla el evento OUTBOX se revierte el pedido completo', async () => {
    const serviceA = makeService(prismaA);

    const firstOrder = await prismaA.order.create({
      data: { total: 50_000 },
    });
    await serviceA.createEventStandalone(
      'duplicate-event-id',
      'ORDER_CREATED',
      firstOrder.id,
      firstOrder.numericId,
      { orderId: firstOrder.id, numericId: firstOrder.numericId },
    );

    let rolledBackOrderId = '';

    await expect(
      prismaA.$transaction(async (tx) => {
        const secondOrder = await tx.order.create({
          data: { total: 75_000 },
        });
        rolledBackOrderId = secondOrder.id;

        await serviceA.createEvent(
          tx,
          'duplicate-event-id',
          'ORDER_CREATED',
          secondOrder.id,
          secondOrder.numericId,
          {
            orderId: secondOrder.id,
            numericId: secondOrder.numericId,
          },
        );
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(rolledBackOrderId).not.toBe('');
    expect(
      await prismaA.order.findUnique({ where: { id: rolledBackOrderId } }),
    ).toBeNull();
    expect(await prismaA.order.count()).toBe(1);
    expect(await prismaA.notificationEvent.count()).toBe(1);
  });

  it('Prueba I2: pedido y evento OUTBOX se confirman juntos', async () => {
    const serviceA = makeService(prismaA);

    const created = await prismaA.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: { total: 60_000 },
      });
      await serviceA.createEvent(
        tx,
        'committed-event-id',
        'ORDER_CREATED',
        order.id,
        order.numericId,
        { orderId: order.id, numericId: order.numericId },
      );
      return order;
    });

    expect(
      await prismaA.order.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
    expect(
      await prismaA.notificationEvent.findUnique({
        where: { eventId: 'committed-event-id' },
      }),
    ).not.toBeNull();
  });

  it('Prueba J: los intentos por dispositivo, nextAttemptAt y el máximo funcionan', async () => {
    await createDevice(prismaA, 'token-j');
    let sends = 0;

    const service = makeService(prismaA, () => {
      sends++;
      return {
        success: false,
        invalidToken: false,
        retryable: true,
        error: 'UNAVAILABLE',
        firebaseErrorCode: 'UNAVAILABLE',
        retryAfterSeconds: 30,
      };
    });

    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-j',
      2,
    );

    const first = await service.processPendingEvents();
    expect(first.failed).toBe(1);

    const afterFirst = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.nextAttemptAt).toBeInstanceOf(Date);

    let delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id },
    });
    expect(delivery.status).toBe('RETRY');
    expect(delivery.attempts).toBe(1);
    expect(delivery.nextAttemptAt).toBeInstanceOf(Date);

    // Simular el paso del backoff.
    await prismaA.notificationEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await prismaA.notificationDelivery.update({
      where: { id: delivery.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    const second = await service.processPendingEvents();
    expect(second.dead).toBe(1);

    delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id },
    });
    expect(delivery.status).toBe('DEAD');
    expect(delivery.attempts).toBe(2);
    expect(delivery.nextAttemptAt).toBeNull();

    const finalEvent = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(finalEvent.status).toBe('DEAD');
    expect(finalEvent.attempts).toBe(2);
    expect(finalEvent.nextAttemptAt).toBeNull();

    const third = await service.processPendingEvents();
    expect(third.processed).toBe(0);
    expect(sends).toBe(2);
  });

  it('Prueba K: una instancia antigua no puede actualizar una entrega', async () => {
    const device = await createDevice(prismaA, 'token-k');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const instanceB = internals(serviceB).instanceId;

    const { event } = await createOrderAndEvent(
      serviceA,
      prismaA,
      'order-created-k',
    );

    // A reclama el evento y crea la entrega mientras es propietaria.
    const claimed = await apiA.claimPendingEvents(new Date());
    expect(claimed.map((item) => item.id)).toContain(event.id);

    const deviceServiceA = new PushDeviceService(prismaA);
    const devices = await deviceServiceA.findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);

    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id, deviceId: device.id },
    });
    expect(delivery.status).toBe('PENDING');

    // B obtiene un nuevo lock válido: A ya no es propietaria.
    const bLock = await forceLockOwnership(prismaB, event.id, instanceB);
    expect(bLock.lockedBy).toBe(instanceB);

    const outcome = await apiA.updateDeliveryIfOwned(event.id, delivery.id, {
      status: 'SENT',
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: new Date(),
      nextAttemptAt: null,
    });
    expect(outcome).toBe('LOCK_LOST');

    // La entrega no cambió.
    const savedDelivery = await prismaB.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(savedDelivery.status).toBe('PENDING');
    expect(savedDelivery.attempts).toBe(0);
    expect(savedDelivery.deliveredAt).toBeNull();

    // B sigue siendo la propietaria del evento y su lock está intacto.
    const savedEvent = await prismaB.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(savedEvent.status).toBe('PROCESSING');
    expect(savedEvent.lockedBy).toBe(instanceB);
    expect(savedEvent.lockedUntil?.getTime()).toBe(
      bLock.lockedUntil?.getTime(),
    );
  });

  it('Prueba L: una instancia antigua no puede crear entregas', async () => {
    await createDevice(prismaA, 'token-l');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const instanceB = internals(serviceB).instanceId;

    const { event } = await createOrderAndEvent(
      serviceA,
      prismaA,
      'order-created-l',
    );

    const claimed = await apiA.claimPendingEvents(new Date());
    expect(claimed.map((item) => item.id)).toContain(event.id);

    // B pasa a ser la propietaria antes de que A cree las entregas.
    const bLock = await forceLockOwnership(prismaB, event.id, instanceB);

    const deviceServiceA = new PushDeviceService(prismaA);
    const devices = await deviceServiceA.findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(false);

    expect(
      await prismaB.notificationDelivery.count({
        where: { notificationEventId: event.id },
      }),
    ).toBe(0);

    const savedEvent = await prismaB.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(savedEvent.status).toBe('PROCESSING');
    expect(savedEvent.lockedBy).toBe(instanceB);
    expect(savedEvent.lockedUntil?.getTime()).toBe(
      bLock.lockedUntil?.getTime(),
    );
  });

  it('Prueba M: perder el lock durante un envío no registra el resultado', async () => {
    await createDevice(prismaA, 'token-m');
    const serviceB = makeService(prismaB);
    const instanceB = internals(serviceB).instanceId;

    const sendStarted = deferred();
    const releaseSend = deferred();

    const serviceA = makeService(prismaA, async () => {
      sendStarted.resolve();
      await releaseSend.promise;
      return success();
    });

    const { event } = await createOrderAndEvent(
      serviceA,
      prismaA,
      'order-created-m',
    );

    const processing = serviceA.processPendingEvents();
    await sendStarted.promise;

    // B se apropia del evento mientras A espera la respuesta de Firebase.
    const bLock = await forceLockOwnership(prismaB, event.id, instanceB);

    releaseSend.resolve();
    const result = await processing;

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.dead).toBe(0);
    expect(result.skipped).toBe(0);

    // A no escribió el resultado de la entrega.
    const delivery = await prismaB.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id },
    });
    expect(delivery.status).toBe('PENDING');
    expect(delivery.attempts).toBe(0);
    expect(delivery.deliveredAt).toBeNull();

    // A tampoco finalizó el evento ni tocó el lock de B.
    const savedEvent = await prismaB.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(savedEvent.status).toBe('PROCESSING');
    expect(savedEvent.lockedBy).toBe(instanceB);
    expect(savedEvent.attempts).toBe(0);
    expect(savedEvent.lockedUntil?.getTime()).toBe(
      bLock.lockedUntil?.getTime(),
    );
  });

  it('Prueba N: una entrega resuelta concurrentemente no vuelve a enviarse', async () => {
    const device = await createDevice(prismaA, 'token-n');
    let sendsB = 0;
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB, () => {
      sendsB++;
      return success();
    });
    const apiA = internals(serviceA);
    const apiB = internals(serviceB);
    const instanceB = apiB.instanceId;

    const { event } = await createOrderAndEvent(
      serviceA,
      prismaA,
      'order-created-n',
    );

    await apiA.claimPendingEvents(new Date());
    const deviceServiceA = new PushDeviceService(prismaA);
    const devices = await deviceServiceA.findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);

    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id, deviceId: device.id },
    });

    // A registra SENT.
    const sentAt = new Date();
    const outcomeA = await apiA.updateDeliveryIfOwned(event.id, delivery.id, {
      status: 'SENT',
      attempts: 1,
      lastAttemptAt: sentAt,
      deliveredAt: sentAt,
      nextAttemptAt: null,
      lastError: null,
      firebaseErrorCode: null,
    });
    expect(outcomeA).toBe('UPDATED');

    // B obtiene el lock e intenta registrar RETRY sobre la misma entrega.
    await forceLockOwnership(prismaB, event.id, instanceB);
    const outcomeB = await apiB.updateDeliveryIfOwned(event.id, delivery.id, {
      status: 'RETRY',
      attempts: 2,
      nextAttemptAt: new Date(Date.now() + 60_000),
      lastError: 'UNAVAILABLE',
    });
    expect(outcomeB).toBe('NOT_PENDING');

    const savedDelivery = await prismaB.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(savedDelivery.status).toBe('SENT');
    expect(savedDelivery.attempts).toBe(1);
    expect(savedDelivery.deliveredAt?.getTime()).toBe(sentAt.getTime());

    // Aunque el evento vuelva a PENDING, el worker no reenvía una entrega
    // ya resuelta: solo finaliza el evento como SENT.
    await prismaB.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        lockedUntil: null,
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    const result = await serviceB.processPendingEvents();
    expect(sendsB).toBe(0);
    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);

    const finalEvent = await prismaB.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(finalEvent.status).toBe('SENT');
    expect(finalEvent.attempts).toBe(1);
  });

  it('Prueba O: los destinatarios quedan congelados en el primer procesamiento', async () => {
    const device1 = await createDevice(prismaA, 'token-o-1');
    const device2 = await createDevice(prismaA, 'token-o-2');

    const calls: string[] = [];
    let attempts2 = 0;

    const service = makeService(prismaA, (token) => {
      calls.push(token);

      if (token === 'token-o-2') {
        attempts2++;
        if (attempts2 === 1) {
          return {
            success: false,
            invalidToken: false,
            retryable: true,
            error: 'UNAVAILABLE',
            firebaseErrorCode: 'UNAVAILABLE',
          };
        }
      }

      return success();
    });

    const { event } = await createOrderAndEvent(
      service,
      prismaA,
      'order-created-o',
    );

    const first = await service.processPendingEvents();
    expect(first.failed).toBe(1);

    const afterFirst = await prismaA.notificationDelivery.findMany({
      where: { notificationEventId: event.id },
    });
    expect(afterFirst).toHaveLength(2);

    const delivery1 = afterFirst.find(
      (delivery) => delivery.deviceId === device1.id,
    );
    const delivery2 = afterFirst.find(
      (delivery) => delivery.deviceId === device2.id,
    );
    expect(delivery1?.status).toBe('SENT');
    expect(delivery2?.status).toBe('RETRY');

    // El tercer dispositivo se registra después del primer procesamiento.
    const device3 = await createDevice(prismaA, 'token-o-3');

    // Simular el paso del backoff del dispositivo pendiente.
    await prismaA.notificationEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await prismaA.notificationDelivery.update({
      where: { id: delivery2!.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    const second = await service.processPendingEvents();
    expect(second.sent).toBe(1);

    // Solo el destinatario originalmente pendiente recibe el reintento.
    expect(calls.filter((token) => token === 'token-o-1')).toHaveLength(1);
    expect(calls.filter((token) => token === 'token-o-2')).toHaveLength(2);
    expect(calls.filter((token) => token === 'token-o-3')).toHaveLength(0);

    const finalDeliveries = await prismaA.notificationDelivery.findMany({
      where: { notificationEventId: event.id },
    });
    expect(finalDeliveries).toHaveLength(2);
    expect(
      finalDeliveries.some((delivery) => delivery.deviceId === device3.id),
    ).toBe(false);

    const finalEvent = await prismaA.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(finalEvent.status).toBe('SENT');
  });

  async function expectBlocked(promise: Promise<unknown>, ms = 300): Promise<boolean> {
    return Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
    ]);
  }

  it('Prueba P: serialización cuando A bloquea primero', async () => {
    await createDevice(prismaA, 'token-p');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const { event } = await createOrderAndEvent(serviceA, prismaA, 'order-created-p');

    await apiA.claimPendingEvents(new Date());
    const devices = await new PushDeviceService(prismaA).findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);
    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id, deviceId: devices[0].id },
    });
    expect(delivery.status).toBe('PENDING');
    const apiB = internals(serviceB);

    // A usa withLockedOwnedEvent: adquiere FOR UPDATE, avisa, mantiene la
    // transacción abierta hasta que se libere y escribe la entrega dentro de
    // la misma transacción que bloquea el padre.
    const lockAcquiredA = deferred();
    const releaseA = deferred();
    const holdA = apiA.withLockedOwnedEvent(event.id, async (tx) => {
      lockAcquiredA.resolve();
      await releaseA.promise;
      await tx.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          notificationEventId: event.id,
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: {
          status: 'SENT',
          attempts: 1,
          lastAttemptAt: new Date(),
          deliveredAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
          firebaseErrorCode: null,
        },
      });
      return true;
    });

    // Confirmar que A realmente adquirió el FOR UPDATE antes de lanzar B.
    await lockAcquiredA.promise;

    // B intenta escribir la misma entrega: debe quedar bloqueada por el lock de A.
    const bPromise = apiB.updateDeliveryIfOwned(event.id, delivery.id, {
      status: 'SENT',
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: new Date(),
      nextAttemptAt: null,
      lastError: null,
      firebaseErrorCode: null,
    });
    const stillBlocked = await expectBlocked(bPromise, 300);

    try {
      expect(stillBlocked).toBe(false);

      // A confirma: libera el lock de PostgreSQL y se aplica su escritura.
      releaseA.resolve();
      await holdA;
      const bResult = await bPromise;

      // La escritura de A ocurrió antes de que B pudiera escribir: la entrega
      // quedó SENT y B no pudo sobrescribirla (A sigue siendo la propietaria).
      const savedDelivery = await prismaB.notificationDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      expect(savedDelivery.status).toBe('SENT');
      expect(savedDelivery.attempts).toBe(1);

      // B comprobó la propiedad tras el commit de A y, como A sigue siendo
      // la propietaria, no pudo modificar la entrega.
      expect(bResult).toBe('LOCK_LOST');

      const savedEvent = await prismaB.notificationEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(savedEvent.status).toBe('PROCESSING');
      expect(savedEvent.lockedBy).toBe(internals(serviceA).instanceId);
    } finally {
      releaseA.resolve();
      await holdA;
    }
  });

  it('Prueba Q: B obtiene el lock antes que A', async () => {
    await createDevice(prismaA, 'token-q');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const instanceB = internals(serviceB).instanceId;
    const { event } = await createOrderAndEvent(serviceA, prismaA, 'order-created-q');

    await apiA.claimPendingEvents(new Date());
    const devices = await new PushDeviceService(prismaA).findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);
    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id, deviceId: devices[0].id },
    });

    // B obtiene el lock antes de que A escriba la entrega.
    await forceLockOwnership(prismaB, event.id, instanceB);

    // A obtiene el bloqueo de fila, comprueba la propiedad actual y devuelve LOCK_LOST.
    const outcome = await apiA.updateDeliveryIfOwned(event.id, delivery.id, {
      status: 'SENT',
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: new Date(),
      nextAttemptAt: null,
      lastError: null,
      firebaseErrorCode: null,
    });
    expect(outcome).toBe('LOCK_LOST');

    // La entrega no se modificó.
    const savedDelivery = await prismaB.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(savedDelivery.status).toBe('PENDING');
    expect(savedDelivery.attempts).toBe(0);
    expect(savedDelivery.deliveredAt).toBeNull();

    // El lock de B se mantiene intacto.
    const savedEvent = await prismaB.notificationEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(savedEvent.status).toBe('PROCESSING');
    expect(savedEvent.lockedBy).toBe(instanceB);
  });

  it('Prueba R: recuperación compite con escritura de entrega', async () => {
    await createDevice(prismaA, 'token-r');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const apiB = internals(serviceB);
    const { event } = await createOrderAndEvent(serviceA, prismaA, 'order-created-r');

    await apiA.claimPendingEvents(new Date());
    const devices = await new PushDeviceService(prismaA).findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);
    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id, deviceId: devices[0].id },
    });

    // A escribe la entrega bajo withLockedOwnedEvent: adquiere FOR UPDATE con
    // lease válido, mantiene el lock del padre abierto y escribe dentro de la
    // misma transacción.
    const lockAcquiredA = deferred();
    const releaseA = deferred();
    const holdA = apiA.withLockedOwnedEvent(event.id, async (tx) => {
      lockAcquiredA.resolve();
      await releaseA.promise;
      await tx.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          notificationEventId: event.id,
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: {
          status: 'SENT',
          attempts: 1,
          lastAttemptAt: new Date(),
          deliveredAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
          firebaseErrorCode: null,
        },
      });
      return true;
    });

    // Confirmar que A adquirió el FOR UPDATE antes de lanzar la recuperación de B.
    await lockAcquiredA.promise;

    // B ejecuta la recuperación mientras A mantiene el lock. Como el lease de A
    // sigue vigente (estado confirmado), la recuperación no debe apropiarse del
    // evento ni bloquearse indefinidamente: simplemente no lo toca.
    const recover = apiB.recoverExpiredLocks();

    try {
      releaseA.resolve();
      await holdA;
      const recovered = await recover;

      // La escritura de A se conserva.
      const savedDelivery = await prismaB.notificationDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      expect(savedDelivery.status).toBe('SENT');
      expect(savedDelivery.attempts).toBe(1);

      // La recuperación no reemplazó el lock vigente: el evento sigue siendo de A.
      const savedEvent = await prismaB.notificationEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(savedEvent.status).toBe('PROCESSING');
      expect(savedEvent.lockedBy).toBe(internals(serviceA).instanceId);
      expect(savedEvent.lockedUntil).not.toBeNull();

      // Como el único evento tiene lease vigente, la recuperación no lo tocó.
      expect(recovered).toBe(0);
    } finally {
      releaseA.resolve();
      await holdA;
    }
  });

  it('Prueba S: espera y expiración durante la adquisición', async () => {
    await createDevice(prismaA, 'token-s');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const { event } = await createOrderAndEvent(serviceA, prismaA, 'order-created-s');

    await apiA.claimPendingEvents(new Date());
    const devices = await new PushDeviceService(prismaA).findAdminDevices();
    await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);
    const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
      where: { notificationEventId: event.id, deviceId: devices[0].id },
    });

    // Forzar que el lease ya expiró aunque A siga siendo la propietaria registrada.
    await prismaA.notificationEvent.update({
      where: { id: event.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    // B mantiene el bloqueo de fila padre mientras A intenta adquirirlo.
    const lockHeldB = deferred();
    const releaseB = deferred();
    const holdB = prismaB.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "NotificationEvent" WHERE "id" = ${event.id} FOR UPDATE`;
      lockHeldB.resolve();
      await releaseB.promise;
    });
    await lockHeldB.promise; // B tiene el lock antes de que A intente adquirirlo.

    // A intenta escribir: queda bloqueada esperando el lock de B. B libera tras un breve
    // lapso, así que A adquiere el bloqueo y comprueba el lease (ya expirado) con clock_timestamp().
    const start = Date.now();
    const outcomePromise = apiA.updateDeliveryIfOwned(event.id, delivery.id, {
      status: 'SENT',
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: new Date(),
      nextAttemptAt: null,
      lastError: null,
      firebaseErrorCode: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    releaseB.resolve();
    const outcome = await outcomePromise;
    const waited = Date.now() - start;
    expect(outcome).toBe('LOCK_LOST');
    expect(waited).toBeGreaterThan(50); // A esperó por el lock antes de comprobar el lease

    await holdB;

    // La entrega no se modificó.
    const savedDelivery = await prismaA.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(savedDelivery.status).toBe('PENDING');
    expect(savedDelivery.attempts).toBe(0);
  });

  it('Prueba T: concurrencia repetida sobre el mismo evento', async () => {
    await createDevice(prismaA, 'token-t');
    const serviceA = makeService(prismaA);
    const serviceB = makeService(prismaB);
    const apiA = internals(serviceA);
    const instanceB = internals(serviceB).instanceId;

    const rounds = 6;
    for (let i = 0; i < rounds; i++) {
      const { event } = await createOrderAndEvent(
        serviceA,
        prismaA,
        `order-created-t-${i}`,
      );
      await apiA.claimPendingEvents(new Date());
      const devices = await new PushDeviceService(prismaA).findAdminDevices();
      await expect(apiA.ensureDeliveries(event.id, devices)).resolves.toBe(true);
      const delivery = await prismaA.notificationDelivery.findFirstOrThrow({
        where: { notificationEventId: event.id, deviceId: devices[0].id },
      });

      // Orden válido 2: B adquiere primero el evento y A no logra modificar la entrega.
      await forceLockOwnership(prismaB, event.id, instanceB);
      const outcome = await apiA.updateDeliveryIfOwned(event.id, delivery.id, {
        status: 'SENT',
        attempts: 1,
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        nextAttemptAt: null,
        lastError: null,
        firebaseErrorCode: null,
      });
      expect(outcome).toBe('LOCK_LOST');

      const saved = await prismaB.notificationDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      expect(saved.status).toBe('PENDING');
      expect(saved.attempts).toBe(0);

      const ev = await prismaB.notificationEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(ev.lockedBy).toBe(instanceB);
    }
  });
});
