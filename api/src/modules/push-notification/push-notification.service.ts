import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDeviceService } from './push-device.service';
import {
  FirebaseMessagingService,
  FcmSendResult,
} from './firebase-messaging.service';

/**
 * Tipos de evento de notificacion push.
 */
export type PushNotificationType =
  'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_CANCELLED';

/**
 * Estado de un evento de notificacion en el outbox.
 *
 * - `PENDING`: listo para ser procesado.
 * - `PROCESSING`: una instancia lo está procesando (bloqueo distribuido).
 * - `SENT`: se entregó al menos a un dispositivo y no quedan reintentos.
 * - `FAILED`: estado legado (los fallos con reintento se guardan como PENDING).
 * - `DEAD`: se agotaron los intentos o hubo un fallo permanente.
 * - `SKIPPED`: no hay dispositivos alcanzables, no se envía.
 */
export type NotificationEventStatus =
  'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD' | 'SKIPPED';

/**
 * Estados de entrega por dispositivo.
 *
 * - `PENDING`: todavía no se intentó.
 * - `SENT`: Firebase aceptó el mensaje para ese token.
 * - `RETRY`: error temporal, se reintentará solo este dispositivo.
 * - `INVALID`: Firebase confirmó UNREGISTERED; el token se elimina.
 * - `DEAD`: fallo permanente o máximo de intentos agotado.
 */
export type NotificationDeliveryStatus =
  'PENDING' | 'SENT' | 'RETRY' | 'INVALID' | 'DEAD';

type ClaimedNotificationEvent = {
  id: string;
  eventId: string;
  type: string;
  orderId: string;
  numericId: number;
  payload: Prisma.JsonValue;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
};

type DeliveryToProcess = {
  id: string;
  deviceId: string | null;
  attempts: number;
  status: string;
  nextAttemptAt: Date | null;
  device: { id: string; token: string } | null;
};

type EventOutcome = NotificationEventStatus | 'LOCK_LOST';

/**
 * Resultado de intentar escribir una entrega protegida por el lock del
 * evento padre.
 *
 * - `UPDATED`: la entrega se modificó (sigue PENDING/RETRY y el lock es
 *   nuestro).
 * - `NOT_PENDING`: la entrega ya estaba resuelta (SENT/INVALID/DEAD) o no
 *   existe; no es un error, simplemente no hay nada que hacer.
 * - `LOCK_LOST`: la entrega seguía PENDING/RETRY pero el evento padre ya no
 *   es PROCESSING con nuestro lock: otra instancia se lo apropió.
 */
type DeliveryWriteOutcome = 'UPDATED' | 'NOT_PENDING' | 'LOCK_LOST';

/**
 * Columnas de `NotificationDelivery` que el worker puede escribir.
 *
 * El UPDATE de entregas se construye dinámicamente porque cada resultado FCM
 * escribe un conjunto distinto de columnas. Esta lista blanca evita que una
 * clave inesperada del objeto de datos llegue al SQL: los nombres de columna
 * nunca se interpolan sin validación.
 */
const DELIVERY_WRITABLE_COLUMNS = new Set([
  'status',
  'attempts',
  'lastAttemptAt',
  'deliveredAt',
  'nextAttemptAt',
  'lastError',
  'firebaseErrorCode',
]);

/**
 * Tiempo de bloqueo distribuido en milisegundos (10 minutos).
 *
 * El lock se renueva antes de cada envío y antes de escribir el resultado
 * final. El timeout HTTP de Firebase es de 20 segundos, así que una instancia
 * activa no pierde el lease mientras espera una respuesta válida. Si la
 * instancia muere, otra puede recuperar el evento tras este lapso.
 */
const LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Número máximo de intentos por defecto (por dispositivo).
 */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Intervalo base para backoff exponencial (segundos).
 */
const BACKOFF_BASE_SECONDS = 30;

/**
 * Máximo de eventos reclamados por ciclo.
 */
const CLAIM_BATCH_SIZE = 50;

/**
 * Servicio de notificaciones push con patrón Outbox, bloqueo distribuido y
 * seguimiento de entrega por dispositivo.
 *
 * Los eventos se persisten en la base de datos dentro de la misma transacción
 * que modifica el pedido, por lo que una caída temporal de Firebase nunca
 * pierde una notificación. Un worker procesa los eventos pendientes con
 * reintentos y deduplicación por eventId.
 *
 * Bloqueo distribuido: cada evento se reclama con `FOR UPDATE SKIP LOCKED`
 * dentro de una transacción PostgreSQL, estableciendo `lockedAt`,
 * `lockedBy` y `lockedUntil`. Solo la instancia que posee el lock puede
 * modificar el evento: todas las escrituras finales usan `updateMany` con la
 * condición `status = PROCESSING AND lockedBy = this.instanceId AND
 * lockedUntil > now`. Si la condición afecta cero filas, la instancia perdió
 * el lock y no toca el evento.
 *
 * Entrega por dispositivo: la primera vez que se procesa un evento se crea
 * una fila `NotificationDelivery` por cada dispositivo admin. En los
 * reintentos solo se envían las filas PENDING/RETRY; las que ya están SENT no
 * se vuelven a notificar. Los dispositivos nuevos no se incorporan a un
 * evento antiguo: la composición de destinatarios queda congelada al primer
 * procesamiento.
 *
 * FCM y las comunicaciones distribuidas tienen garantías de entrega al menos
 * una vez. Si Firebase acepta un mensaje pero la respuesta se pierde, el
 * dispositivo puede recibirlo de nuevo; el sistema evita duplicados en todos
 * los casos observables, no en una respuesta perdida.
 *
 * Los errores de Firebase nunca propagan excepción: si el envío falla, se
 * registra el resultado por dispositivo y se reintenta con backoff
 * exponencial. Los errores permanentes agotan la entrega de ese dispositivo
 * sin reintentos infinitos. Los tokens FCM solo se eliminan cuando Firebase
 * responde explícitamente UNREGISTERED.
 */
@Injectable()
export class PushNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationService.name);
  private workerInterval: NodeJS.Timeout | null = null;
  private processing = false;
  // `Date.now()` solo no basta: dos procesos/contenedores pueden arrancar en
  // el mismo milisegundo (incluso con el mismo PID en contenedores distintos)
  // y creerían compartir el lock. El UUID garantiza unicidad real.
  private readonly instanceId = `${process.pid}-${Date.now()}-${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceService: PushDeviceService,
    private readonly fcm: FirebaseMessagingService,
  ) {}

  onModuleInit() {
    // Arrancar el worker automático cada 30 segundos.
    // El flag `processing` evita ejecuciones simultáneas dentro de la misma
    // instancia. Entre instancias distintas se coordina mediante bloqueo
    // distribuido (`FOR UPDATE SKIP LOCKED`) en la base de datos.
    this.workerInterval = setInterval(() => {
      void this.processPendingEvents();
    }, 30000);
    this.logger.log(
      `Worker de notificaciones push iniciado (cada 30s, instancia ${this.instanceId})`,
    );
  }

  onModuleDestroy() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  /**
   * Ejecuta manualmente el procesamiento de eventos pendientes (usado por el
   * worker automático y por pruebas).
   */
  async processPendingEventsCron() {
    await this.processPendingEvents();
  }

  /**
   * Crea un evento de notificación en el outbox.
   * Debe llamarse dentro de la transacción que modifica el pedido para
   * garantizar atomicidad.
   *
   * @param tx - Cliente Prisma de la transacción activa
   * @param eventId - Identificador único del evento (para deduplicación)
   * @param type - Tipo de evento
   * @param orderId - ID del pedido
   * @param numericId - Número de pedido para mostrar
   * @param payload - Datos adicionales enviados a FCM
   */
  async createEvent(
    tx: Prisma.TransactionClient | PrismaClient,
    eventId: string,
    type: PushNotificationType,
    orderId: string,
    numericId: number,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.notificationEvent.create({
      data: {
        eventId,
        type,
        orderId,
        numericId,
        payload,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: new Date(),
      },
    });
  }

  /**
   * Crea un evento de notificación fuera de una transacción (uso independiente).
   * Se usa cuando no hay transacción Prisma activa (por ejemplo, en pruebas o
   * en flujos externos).
   */
  async createEventStandalone(
    eventId: string,
    type: PushNotificationType,
    orderId: string,
    numericId: number,
    payload: Prisma.InputJsonValue,
  ) {
    await this.prisma.notificationEvent.create({
      data: {
        eventId,
        type,
        orderId,
        numericId,
        payload,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: new Date(),
      },
    });
  }

  /**
   * Calcula el siguiente momento de intento con backoff exponencial y jitter.
   *
   * @param attempts - Número de intentos ya realizados (0-indexado)
   * @param retryAfterSeconds - Valor del header Retry-After de Firebase, si lo hay
   * @returns Fecha del próximo intento
   */
  private calculateNextAttemptAt(
    attempts: number,
    retryAfterSeconds?: number,
  ): Date {
    // Si Firebase indicó Retry-After, respetarlo con un pequeño margen.
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      return new Date(Date.now() + retryAfterSeconds * 1000 + 1000);
    }

    // Backoff exponencial: base * 2^attempts, con jitter (±25%).
    const base = BACKOFF_BASE_SECONDS * Math.pow(2, attempts);
    const jitter = base * 0.25 * (Math.random() * 2 - 1);
    const delaySeconds = Math.max(1, Math.floor(base + jitter));

    return new Date(Date.now() + delaySeconds * 1000);
  }

  /**
   * Procesa todos los eventos pendientes usando bloqueo distribuido.
   *
   * Reclama eventos con `FOR UPDATE SKIP LOCKED` para que dos instancias
   * no procesen el mismo evento simultáneamente. Los eventos con lock
   * expirado se recuperan automáticamente.
   *
   * Los eventos sin dispositivos admin registrados se marcan como SKIPPED
   * (no se cuenta como enviado ni como fallo).
   */
  async processPendingEvents(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    dead: number;
    skipped: number;
  }> {
    if (this.processing) {
      this.logger.debug(
        'Worker ya está procesando eventos, saltando esta ejecución',
      );
      return { processed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };
    }

    this.processing = true;
    try {
      return await this.processPendingEventsInternal();
    } finally {
      this.processing = false;
    }
  }

  private async processPendingEventsInternal(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    dead: number;
    skipped: number;
  }> {
    // Recuperar bloqueos expirados antes de reclamar (instancia caída).
    await this.recoverExpiredLocks();

    const claimed = await this.claimPendingEvents(new Date());

    if (claimed.length === 0) {
      return { processed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };
    }

    let sent = 0;
    let failed = 0;
    let dead = 0;
    let skipped = 0;

    for (const event of claimed) {
      const outcome = await this.processClaimedEvent(event);

      switch (outcome) {
        case 'SENT':
          sent++;
          break;
        case 'PENDING':
          failed++;
          break;
        case 'DEAD':
          dead++;
          break;
        case 'SKIPPED':
          skipped++;
          break;
        case 'LOCK_LOST':
          // Otra instancia es la dueña actual: no contabilizar este evento.
          break;
        default:
          break;
      }
    }

    return {
      processed: claimed.length,
      sent,
      failed,
      dead,
      skipped,
    };
  }

  /**
   * Reclama eventos PENDING y los pasa a PROCESSING en una única sentencia
   * SQL atómica. Los identificadores camelCase van entre comillas porque las
   * migraciones de PostgreSQL los crearon con mayúsculas.
   */
  private async claimPendingEvents(
    now: Date,
  ): Promise<ClaimedNotificationEvent[]> {
    const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS);

    return this.prisma.$queryRaw<ClaimedNotificationEvent[]>`
      WITH "claimed" AS (
        SELECT "e"."id"
        FROM "NotificationEvent" AS "e"
        WHERE "e"."status" = 'PENDING'
          AND (
            "e"."nextAttemptAt" IS NULL
            OR "e"."nextAttemptAt" <= (${now} AT TIME ZONE 'UTC')
          )
          AND (
            "e"."lockedUntil" IS NULL
            OR "e"."lockedUntil" <= (${now} AT TIME ZONE 'UTC')
          )
        ORDER BY "e"."createdAt" ASC, "e"."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${CLAIM_BATCH_SIZE}
      )
      UPDATE "NotificationEvent" AS "e"
      SET "status" = 'PROCESSING',
          "lockedAt" = (${now} AT TIME ZONE 'UTC'),
          "lockedBy" = ${this.instanceId},
          "lockedUntil" = (${lockedUntil} AT TIME ZONE 'UTC'),
          "updatedAt" = (${now} AT TIME ZONE 'UTC')
      FROM "claimed" AS "c"
      WHERE "e"."id" = "c"."id"
      RETURNING "e"."id",
                "e"."eventId",
                "e"."type",
                "e"."orderId",
                "e"."numericId",
                "e"."payload",
                "e"."status",
                "e"."attempts",
                "e"."maxAttempts",
                "e"."lastError"
    `;
  }

  private async processClaimedEvent(
    event: ClaimedNotificationEvent,
  ): Promise<EventOutcome> {
    try {
      // Renovar el lease antes de cualquier trabajo costoso.
      if (!(await this.renewLease(event.id))) {
        return this.loseLock(event, 'al iniciar el procesamiento');
      }

      const deliveryCount = await this.prisma.notificationDelivery.count({
        where: { notificationEventId: event.id },
      });

      if (deliveryCount === 0) {
        const devices = await this.deviceService.findAdminDevices();

        if (devices.length === 0) {
          return this.finalizeEvent(event);
        }

        // Si la instancia ya no posee el lock del evento padre, no se crean
        // entregas y se detiene el procesamiento de este evento.
        const created = await this.ensureDeliveries(event.id, devices);
        if (!created) {
          return this.loseLock(event, 'al crear entregas');
        }
      }

      const pendingDeliveries = await this.prisma.notificationDelivery.findMany(
        {
          where: {
            notificationEventId: event.id,
            status: { in: ['PENDING', 'RETRY'] },
          },
          select: {
            id: true,
            deviceId: true,
            attempts: true,
            status: true,
            nextAttemptAt: true,
            device: { select: { id: true, token: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      );

      const now = new Date();
      const dueDeliveries = pendingDeliveries.filter(
        (delivery) => !delivery.nextAttemptAt || delivery.nextAttemptAt <= now,
      );

      for (const delivery of dueDeliveries) {
        // El lease se renueva antes de cada envío. Si otra instancia lo
        // recuperó, este worker deja de escribir inmediatamente.
        if (!(await this.renewLease(event.id))) {
          return this.loseLock(event, 'antes de enviar a un dispositivo');
        }

        if (!delivery.device?.token) {
          // El dispositivo se eliminó después de crear la entrega. Se cierra
          // como INVALID conservando el historial (deviceId queda en NULL).
          const outcome = await this.updateDeliveryIfOwned(
            event.id,
            delivery.id,
            {
              status: 'INVALID',
              lastAttemptAt: new Date(),
              nextAttemptAt: null,
              lastError: 'Dispositivo o token eliminado antes del envío',
            },
          );
          if (outcome === 'LOCK_LOST') {
            return this.loseLock(event, 'al marcar dispositivo sin token');
          }
          // Si es NOT_PENDING, la entrega ya estaba resuelta: continuar.
          continue;
        }

        const result = await this.fcm.sendToToken(
          delivery.device.token,
          this.titleFor(event.type as PushNotificationType),
          this.bodyFor(event.type as PushNotificationType, event.numericId),
          event.payload as Record<string, string | number | boolean | null>,
        );

        // Si la instancia perdió el lock mientras esperaba Firebase o al
        // escribir el resultado, detenemos el procesamiento inmediatamente:
        // no tocamos más entregas ni finalizamos el evento.
        const outcome = await this.recordDeliveryResult(
          delivery,
          result,
          event.maxAttempts,
          event.id,
        );
        if (outcome === 'LOCK_LOST') {
          return this.loseLock(event, 'tras enviar a un dispositivo');
        }
        // Si es NOT_PENDING o UPDATED, continuar con la siguiente entrega.
      }

      return this.finalizeEvent(event);
    } catch (err) {
      return this.handleProcessingError(event, err as Error);
    }
  }

  /**
   * Crea las entregas por dispositivo si el evento todavía no tiene ninguna.
   * Solo procede si esta instancia sigue poseyendo el lock del evento padre.
   *
   * La verificación de propiedad y la creación de entregas ocurren dentro de
   * la misma transacción PostgreSQL: `SELECT ... FOR UPDATE` bloquea la fila
   * del evento y comprueba `status = PROCESSING`, `lockedBy = instanceId` y
   * `lockedUntil > now`. Otra instancia no puede apropiarse del lock entre la
   * comprobación y el `createMany`. No hay llamadas a Firebase dentro de esta
   * transacción (es corta y solo toca la base de datos).
   *
   * `skipDuplicates` + el índice único protegen además ante reintentos.
   *
   * Política explícita: si ya existen entregas, no se añaden dispositivos
   * nuevos a un evento antiguo. Los destinatarios se congelan en el primer
   * procesamiento para no reenviar a dispositivos que no estaban en el
   * snapshot original.
   *
   * @returns true si las entregas quedaron creadas (o no había dispositivos
   * que registrar), false si la instancia perdió el lock del evento padre.
   */
  private async ensureDeliveries(
    eventId: string,
    devices: Awaited<ReturnType<PushDeviceService['findAdminDevices']>>,
  ): Promise<boolean> {
    const now = new Date();
    const data = devices
      .filter((device) => Boolean(device.token))
      .map((device) => ({
        notificationEventId: eventId,
        deviceId: device.id,
        recipientKey: this.recipientKeyForToken(device.token),
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: now,
      }));

    return this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del evento y verifica la propiedad en la misma
      // transacción. Si el lock expiró o pertenece a otra instancia, no se
      // crea ninguna entrega.
      const owned = await tx.$queryRaw<{ id: string }[]>`
        SELECT "e"."id"
        FROM "NotificationEvent" AS "e"
        WHERE "e"."id" = ${eventId}
          AND "e"."status" = 'PROCESSING'
          AND "e"."lockedBy" = ${this.instanceId}
          AND "e"."lockedUntil" > (${now} AT TIME ZONE 'UTC')
        FOR UPDATE
      `;

      if (owned.length === 0) {
        this.logger.warn(
          `Evento ${eventId}: lock perdido antes de crear entregas, no se crearán`,
        );
        return false;
      }

      if (data.length > 0) {
        await tx.notificationDelivery.createMany({
          data,
          skipDuplicates: true,
        });
      }

      return true;
    });
  }

  /**
   * Comprueba si esta instancia sigue poseyendo el lock vigente del evento.
   * Condición: status = PROCESSING, lockedBy = this.instanceId,
   * lockedUntil > ahora.
   */
  private async eventStillOwned(eventId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.notificationEvent.findFirst({
      where: {
        id: eventId,
        status: 'PROCESSING',
        lockedBy: this.instanceId,
        lockedUntil: { gt: now },
      },
      select: { id: true },
    });
    return result !== null;
  }

  /**
   * Registra el resultado de un envío FCM en la entrega, solo si esta
   * instancia sigue poseyendo el lock del evento padre.
   *
   * @returns 'UPDATED' si se escribió el resultado, 'NOT_PENDING' si la
   * entrega ya estaba resuelta (no hay nada que hacer), 'LOCK_LOST' si la
   * instancia ya no posee el lock del evento padre.
   */
  private async recordDeliveryResult(
    delivery: DeliveryToProcess,
    result: FcmSendResult,
    maxAttempts: number,
    eventId: string,
  ): Promise<'UPDATED' | 'NOT_PENDING' | 'LOCK_LOST'> {
    const now = new Date();
    const attempts = delivery.attempts + 1;
    const error = this.describeFcmError(result);

    if (result.success) {
      return this.updateDeliveryIfOwned(eventId, delivery.id, {
        status: 'SENT',
        attempts,
        lastAttemptAt: now,
        deliveredAt: now,
        nextAttemptAt: null,
        lastError: null,
        firebaseErrorCode: null,
      });
    }

    if (result.invalidToken) {
      // Historial primero: si el token se borra, deviceId pasa a NULL pero la
      // fila de entrega se conserva.
      const outcome = await this.updateDeliveryIfOwned(eventId, delivery.id, {
        status: 'INVALID',
        attempts,
        lastAttemptAt: now,
        nextAttemptAt: null,
        lastError: error,
        firebaseErrorCode:
          result.firebaseErrorCode ?? result.fcmErrorCode ?? null,
      });
      if (outcome !== 'UPDATED') return outcome;

      if (delivery.device?.token) {
        try {
          await this.deviceService.deleteByTokenIfPresent(
            delivery.device.token,
          );
          this.logger.log(
            `Token FCM UNREGISTERED eliminado: ${delivery.device.token.substring(0, 12)}...`,
          );
        } catch (err) {
          this.logger.error(
            `No se pudo eliminar token ${delivery.device.token.substring(0, 12)}...: ${(err as Error).message}`,
          );
        }
      }
      return 'UPDATED';
    }

    if (result.retryable && attempts < maxAttempts) {
      return this.updateDeliveryIfOwned(eventId, delivery.id, {
        status: 'RETRY',
        attempts,
        lastAttemptAt: now,
        nextAttemptAt: this.calculateNextAttemptAt(
          attempts,
          result.retryAfterSeconds,
        ),
        lastError: error,
        firebaseErrorCode:
          result.firebaseErrorCode ?? result.fcmErrorCode ?? null,
      });
    }

    // Error permanente o máximo de intentos agotado: no volver a intentar
    // este dispositivo con el mismo contenido.
    return this.updateDeliveryIfOwned(eventId, delivery.id, {
      status: 'DEAD',
      attempts,
      lastAttemptAt: now,
      nextAttemptAt: null,
      lastError: result.retryable
        ? `Máximo de intentos alcanzado: ${error}`
        : `Error permanente: ${error}`,
      firebaseErrorCode:
        result.firebaseErrorCode ?? result.fcmErrorCode ?? null,
    });
  }

  /**
   * Escribe el resultado de una entrega solo si:
   * - la entrega sigue PENDING o RETRY, y
   * - el evento NotificationEvent padre sigue PROCESSING con el lock
   *   perteneciente a esta instancia y no expirado.
   *
   * Toda la comprobación ocurre dentro de una única sentencia UPDATE ... FROM
   * contra PostgreSQL, así que no existe ventana de carrera entre verificar
   * y escribir. Si afecta cero filas, se distingue si la entrega ya estaba
   * resuelta (NOT_PENDING) o si se perdió el lock del evento padre (LOCK_LOST).
   */
  private async updateDeliveryIfOwned(
    eventId: string,
    deliveryId: string,
    data: Prisma.NotificationDeliveryUpdateManyMutationInput,
  ): Promise<DeliveryWriteOutcome> {
    const now = new Date();

    // Construir cláusula SET dinámicamente desde los campos de data. Los
    // nombres de columna se validan contra una lista blanca y los valores
    // siempre viajan como parámetros posicionales ($1, $2, ...).
    //
    // Prisma enlaza un `Date` como `timestamptz`, pero las columnas de
    // Prisma son `TIMESTAMP(3)` sin zona. `AT TIME ZONE 'UTC'` convierte el
    // instante al timestamp UTC que Prisma espera, sin depender del TimeZone
    // de la sesión (en local puede ser America/Bogota).
    const setClauses: string[] = [`"updatedAt" = ($1 AT TIME ZONE 'UTC')`];
    const values: unknown[] = [now];
    let paramIdx = 2;

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (!DELIVERY_WRITABLE_COLUMNS.has(key)) {
        throw new Error(`Columna de entrega no permitida: ${key}`);
      }
      const placeholder = `$${paramIdx++}`;
      setClauses.push(
        `"${key}" = ${value instanceof Date ? `(${placeholder} AT TIME ZONE 'UTC')` : placeholder}`,
      );
      values.push(value);
    }

    const setSql = setClauses.join(', ');

    // Parámetros finales: deliveryId, eventId, instanceId, now.
    const deliveryIdIdx = paramIdx++;
    const eventIdIdx = paramIdx++;
    const instanceIdIdx = paramIdx++;
    const nowIdx = paramIdx++;

    const sql = `
      UPDATE "NotificationDelivery" AS "d"
      SET ${setSql}
      FROM "NotificationEvent" AS "e"
      WHERE "d"."id" = $${deliveryIdIdx}
        AND "d"."notificationEventId" = $${eventIdIdx}
        AND "d"."status" IN ('PENDING', 'RETRY')
        AND "e"."id" = "d"."notificationEventId"
        AND "e"."status" = 'PROCESSING'
        AND "e"."lockedBy" = $${instanceIdIdx}
        AND "e"."lockedUntil" > ($${nowIdx} AT TIME ZONE 'UTC')
      RETURNING "d"."id"
    `;

    const result = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      sql,
      ...values,
      deliveryId,
      eventId,
      this.instanceId,
      now,
    );

    if (result.length > 0) return 'UPDATED';

    // No se actualizó ninguna fila. Distinguir si la entrega ya estaba
    // resuelta (NOT_PENDING) o si perdimos el lock del evento padre (LOCK_LOST).
    const stillOwned = await this.eventStillOwned(eventId);
    return stillOwned ? 'NOT_PENDING' : 'LOCK_LOST';
  }

  /**
   * Calcula el estado final del evento a partir de sus entregas y lo escribe
   * solo si esta instancia todavía posee el lock.
   */
  private async finalizeEvent(
    event: ClaimedNotificationEvent,
  ): Promise<EventOutcome> {
    const now = new Date();

    if (!(await this.renewLease(event.id))) {
      return this.loseLock(event, 'antes de escribir el resultado final');
    }

    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: { notificationEventId: event.id },
      select: {
        status: true,
        nextAttemptAt: true,
        lastError: true,
      },
    });

    const retryable = deliveries.filter(
      (delivery) =>
        delivery.status === 'PENDING' || delivery.status === 'RETRY',
    );

    let outcome: NotificationEventStatus;
    let data: Prisma.NotificationEventUpdateManyMutationInput;

    if (retryable.length > 0) {
      const nextDates = retryable
        .map((delivery) => delivery.nextAttemptAt)
        .filter((date): date is Date => date instanceof Date);
      const nextAttemptAt =
        nextDates.length > 0
          ? new Date(Math.min(...nextDates.map((date) => date.getTime())))
          : now;

      outcome = 'PENDING';
      data = {
        status: 'PENDING',
        attempts: event.attempts + 1,
        nextAttemptAt,
        lastError: this.summarizeRetryState(retryable),
        lockedAt: null,
        lockedBy: null,
        lockedUntil: null,
      };
    } else {
      const anySent = deliveries.some((delivery) => delivery.status === 'SENT');
      const anyDead = deliveries.some((delivery) => delivery.status === 'DEAD');

      outcome = anySent ? 'SENT' : anyDead ? 'DEAD' : 'SKIPPED';
      data = {
        status: outcome,
        attempts: event.attempts + 1,
        nextAttemptAt: null,
        lastError: anySent ? null : this.summarizeTerminalState(deliveries),
        processedAt: now,
        lockedAt: null,
        lockedBy: null,
        lockedUntil: null,
      };
    }

    const updated = await this.writeEventIfOwned(event.id, data, now);
    if (!updated) {
      return this.loseLock(event, 'al escribir el resultado final');
    }

    return outcome;
  }

  private async handleProcessingError(
    event: ClaimedNotificationEvent,
    err: Error,
  ): Promise<EventOutcome> {
    const now = new Date();
    this.logger.error(
      `Error procesando evento ${event.eventId}: ${err.message}`,
    );

    // No renovar aquí si el lease ya venció: la instancia no debe resucitar un
    // lock que otra pudo reclamar. Si sigue vigente, se escribe el fallo.
    const stillOwned = await this.renewLease(event.id);
    if (!stillOwned) {
      return this.loseLock(event, 'tras un error de procesamiento');
    }

    const attempts = event.attempts + 1;
    const maxAttempts = event.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    const dead = attempts >= maxAttempts;

    const data: Prisma.NotificationEventUpdateManyMutationInput = dead
      ? {
          status: 'DEAD',
          attempts,
          nextAttemptAt: null,
          lastError: this.truncateError(err.message),
          processedAt: now,
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        }
      : {
          status: 'PENDING',
          attempts,
          lastError: this.truncateError(err.message),
          nextAttemptAt: this.calculateNextAttemptAt(attempts),
          lockedAt: null,
          lockedBy: null,
          lockedUntil: null,
        };

    const updated = await this.writeEventIfOwned(event.id, data, now);
    if (!updated) {
      return this.loseLock(event, 'al registrar el error de procesamiento');
    }

    return dead ? 'DEAD' : 'PENDING';
  }

  /**
   * Condición de propiedad del lock. Si afecta cero filas, otra instancia es
   * la dueña (o el evento cambió de estado) y esta instancia no debe escribir.
   */
  private async writeEventIfOwned(
    eventId: string,
    data: Prisma.NotificationEventUpdateManyMutationInput,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.notificationEvent.updateMany({
      where: {
        id: eventId,
        status: 'PROCESSING',
        lockedBy: this.instanceId,
        lockedUntil: { gt: now },
      },
      data,
    });

    if (result.count === 0) {
      return false;
    }
    return true;
  }

  private async renewLease(eventId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.notificationEvent.updateMany({
      where: {
        id: eventId,
        status: 'PROCESSING',
        lockedBy: this.instanceId,
        lockedUntil: { gt: now },
      },
      data: {
        lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
      },
    });
    return result.count === 1;
  }

  private loseLock(
    event: ClaimedNotificationEvent,
    phase: string,
  ): 'LOCK_LOST' {
    this.logger.warn(
      `Evento ${event.eventId}: se perdió el lock ${phase}; ` +
        'no se modificará el evento ni el lock de la instancia actual',
    );
    return 'LOCK_LOST';
  }

  private summarizeRetryState(
    deliveries: { lastError: string | null }[],
  ): string {
    const lastError = deliveries
      .map((delivery) => delivery.lastError)
      .filter((error): error is string => Boolean(error))
      .pop();

    const base = `Reintento pendiente en ${deliveries.length} dispositivo(s)`;
    return lastError ? `${base}: ${this.truncateError(lastError)}` : base;
  }

  private summarizeTerminalState(
    deliveries: { status: string; lastError: string | null }[],
  ): string {
    const invalid = deliveries.filter(
      (delivery) => delivery.status === 'INVALID',
    ).length;
    const dead = deliveries.filter(
      (delivery) => delivery.status === 'DEAD',
    ).length;
    const lastError = deliveries
      .map((delivery) => delivery.lastError)
      .filter((error): error is string => Boolean(error))
      .pop();

    const parts = [
      `sin entregas correctas (inválidos: ${invalid}, fallos definitivos: ${dead})`,
    ];
    if (lastError) parts.push(this.truncateError(lastError));
    return parts.join(': ');
  }

  private describeFcmError(result: FcmSendResult): string {
    const code = result.firebaseErrorCode ?? result.fcmErrorCode;
    const raw = result.error ?? 'Error desconocido de FCM';
    const message = code && !raw.includes(code) ? `${code}: ${raw}` : raw;
    return this.truncateError(message);
  }

  private truncateError(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    return normalized.length > 500
      ? `${normalized.slice(0, 500)}...`
      : normalized;
  }

  private recipientKeyForToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Recupera eventos cuyo bloqueo haya expirado (instancia caída).
   * Los pone de nuevo como PENDING para que otra instancia pueda reclamarlos.
   * No toca locks vigentes y conserva `attempts` y el historial de entregas.
   */
  async recoverExpiredLocks(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.notificationEvent.updateMany({
      where: {
        status: 'PROCESSING',
        lockedUntil: { lt: now },
      },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        lockedUntil: null,
      },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Recuperados ${result.count} evento(s) con lock expirado`,
      );
    }

    return result.count;
  }

  /**
   * Marca un evento como enviado (para usar en pruebas o flujos externos).
   */
  async markAsSent(eventId: string) {
    await this.prisma.notificationEvent.update({
      where: { eventId },
      data: {
        status: 'SENT',
        processedAt: new Date(),
      },
    });
  }

  private titleFor(type: PushNotificationType): string {
    switch (type) {
      case 'ORDER_CREATED':
        return 'Nuevo pedido en Kronio Market';
      case 'ORDER_STATUS_CHANGED':
        return 'Actualización de pedido';
      case 'ORDER_CANCELLED':
        return 'Pedido cancelado';
    }
  }

  private bodyFor(type: PushNotificationType, numericId: number): string {
    switch (type) {
      case 'ORDER_CREATED':
        return `Has recibido un nuevo pedido #${numericId}.`;
      case 'ORDER_STATUS_CHANGED':
        return `El pedido #${numericId} cambió de estado.`;
      case 'ORDER_CANCELLED':
        return `El pedido #${numericId} fue cancelado.`;
    }
  }
}
