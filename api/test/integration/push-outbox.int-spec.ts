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
});
