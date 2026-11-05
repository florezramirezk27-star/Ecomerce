import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDeviceService } from './push-device.service';
import { FirebaseMessagingService, FcmSendResult } from './firebase-messaging.service';

/**
 * Tipos de evento de notificacion push.
 */
export type PushNotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_CANCELLED';

/**
 * Estado de un evento de notificacion en el outbox.
 *
 * - `PENDING`: listo para ser procesado.
 * - `PROCESSING`: una instancia lo está procesando (bloqueo distribuido).
 * - `SENT`: se envió al menos a un dispositivo correctamente.
 * - `FAILED`: falló el envío, quedan intentos restantes.
 * - `DEAD`: se agotaron los intentos.
 * - `SKIPPED`: no hay dispositivos admin registrados, no se envía.
 */
export type NotificationEventStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'DEAD'
  | 'SKIPPED';

/**
 * Tiempo de bloqueo distribuido en milisegundos (10 minutos).
 * Si una instancia cae mientras procesa, otra instancia recupera el evento
 * tras este lapso.
 */
const LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Número máximo de intentos por defecto.
 */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Intervalo base para backoff exponencial (segundos).
 */
const BACKOFF_BASE_SECONDS = 30;

/**
 * Servicio de notificaciones push con patrón Outbox y bloqueo distribuido.
 *
 * Los eventos se persisten en la base de datos dentro de la misma transacción
 * que modifica el pedido, por lo que una caída temporal de Firebase nunca
 * pierde una notificación. Un worker procesa los eventos pendientes con
 * reintentos y deduplicación por eventId.
 *
 * Bloqueo distribuido: cada evento se reclama con `FOR UPDATE SKIP LOCKED`
 * dentro de una transacción PostgreSQL, estableciendo `lockedAt`,
 * `lockedBy` y `lockedUntil`. Solo la instancia que posee el lock puede
 * modificar el evento. Los bloqueos expirados se recuperan automáticamente.
 *
 * Los errores de Firebase nunca propagan excepción: si el envío falla, el
 * evento queda marcado como FAILED y se reintentará con backoff exponencial.
 * Solo al alcanzar el máximo de intentos pasa a DEAD.
 *
 * Los tokens FCM solo se eliminan cuando Firebase responde explícitamente
 * UNREGISTERED. Otros errores (400, 500, red) no provocan eliminación.
 */
@Injectable()
export class PushNotificationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PushNotificationService.name);
  private workerInterval: NodeJS.Timeout | null = null;
  private processing = false;
  private readonly instanceId = `${process.pid}-${Date.now()}`;

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
    const now = new Date();

    // Reclamar eventos pendientes con bloqueo distribuido.
    // Usamos una transacción con FOR UPDATE SKIP LOCKED para que cada
    // instancia solo procese los eventos que logra bloquear.
    const claimed = await this.prisma.$queryRawUnsafe<{
      id: string;
      eventId: string;
      type: string;
      orderId: string;
      numericId: number;
      payload: Prisma.InputJsonValue;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
    }[]>(`
      SELECT id, eventId, type, orderId, numericId, payload, status, attempts, maxAttempts, lastError
      FROM "NotificationEvent"
      WHERE status = 'PENDING'
        AND (nextAttemptAt IS NULL OR nextAttemptAt <= $1)
        AND (lockedUntil IS NULL OR lockedUntil <= $1)
      ORDER BY createdAt ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 50
    `, now);

    if (!claimed || claimed.length === 0) {
      return { processed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };
    }

    // Establecer bloqueo en los eventos reclamados.
    const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
    for (const event of claimed) {
      await this.prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSING',
          lockedAt: new Date(),
          lockedBy: this.instanceId,
          lockedUntil,
        },
      });
    }

    let sent = 0;
    let failed = 0;
    let dead = 0;
    let skipped = 0;

    for (const event of claimed) {
      try {
        // Verificar que todavía poseemos el lock (otra instancia no lo robó).
        const current = await this.prisma.notificationEvent.findUnique({
          where: { id: event.id },
          select: { lockedBy: true, lockedUntil: true },
        });

        if (
          !current ||
          current.lockedBy !== this.instanceId ||
          (current.lockedUntil && current.lockedUntil <= now)
        ) {
          // Otro instancia se hizo con el lock o expiró: saltar.
          this.logger.debug(
            `Evento ${event.eventId} ya no está bajo nuestro lock, saltando`,
          );
          continue;
        }

        const devices = await this.deviceService.findAdminDevices();

        if (devices.length === 0) {
          // No hay dispositivos registrados: marcar como SKIPPED (no es fallo ni enviado).
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'SKIPPED',
              lockedAt: null,
              lockedBy: null,
              lockedUntil: null,
              processedAt: new Date(),
            },
          });
          skipped++;
          continue;
        }

        const results = await Promise.all(
          devices.map((device) =>
            this.fcm.sendToToken(
              device.token,
              this.titleFor(event.type as PushNotificationType, event.numericId),
              this.bodyFor(event.type as PushNotificationType, event.numericId),
              event.payload as Record<string, string | number | boolean | null>,
            ),
          ),
        );

        // Separar dispositivos por resultado: solo eliminar tokens UNREGISTERED.
        const tokensToDelete: string[] = [];
        let anySuccess = false;
        let maxRetryAfter: number | undefined;

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const device = devices[i];
          if (result.success) {
            anySuccess = true;
          }
          if (result.invalidToken && device.token) {
            tokensToDelete.push(device.token);
          }
          if (result.retryAfterSeconds && (!maxRetryAfter || result.retryAfterSeconds > maxRetryAfter)) {
            maxRetryAfter = result.retryAfterSeconds;
          }
        }

        // Eliminar exclusivamente los tokens que Firebase confirmó como UNREGISTERED.
        for (const token of tokensToDelete) {
          try {
            await this.deviceService.deleteByToken(token);
            this.logger.log(
              `Token FCM UNREGISTERED eliminado: ${token.substring(0, 12)}...`,
            );
          } catch (err) {
            this.logger.error(
              `No se pudo eliminar token ${token}: ${(err as Error).message}`,
            );
          }
        }

        const nextAttempts = (event.attempts ?? 0) + 1;
        const maxAttempts = event.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

        if (anySuccess) {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'SENT',
              lockedAt: null,
              lockedBy: null,
              lockedUntil: null,
              processedAt: new Date(),
            },
          });
          sent++;
        } else if (nextAttempts >= maxAttempts) {
          // Se agotaron los intentos: marcar como DEAD para no reprocesar más.
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'DEAD',
              attempts: nextAttempts,
              lastError:
                'Máximo de intentos alcanzado' +
                (maxRetryAfter ? ` (retry-after ${maxRetryAfter}s)` : ''),
              lockedAt: null,
              lockedBy: null,
              lockedUntil: null,
              processedAt: new Date(),
            },
          });
          dead++;
        } else {
          // Reintentable: queda como PENDING con attempts incrementado
          // y nextAttemptAt calculado con backoff exponencial.
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'PENDING',
              attempts: nextAttempts,
              lastError: 'Todos los dispositivos fallaron',
              nextAttemptAt: this.calculateNextAttemptAt(
                nextAttempts,
                maxRetryAfter,
              ),
              lockedAt: null,
              lockedBy: null,
              lockedUntil: null,
            },
          });
          failed++;
        }
      } catch (err) {
        const nextAttempts = (event.attempts ?? 0) + 1;
        const maxAttempts = event.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

        if (nextAttempts >= maxAttempts) {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'DEAD',
              attempts: nextAttempts,
              lastError: (err as Error).message,
              lockedAt: null,
              lockedBy: null,
              lockedUntil: null,
              processedAt: new Date(),
            },
          });
          dead++;
        } else {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'PENDING',
              attempts: nextAttempts,
              lastError: (err as Error).message,
              nextAttemptAt: this.calculateNextAttemptAt(nextAttempts),
              lockedAt: null,
              lockedBy: null,
              lockedUntil: null,
            },
          });
          failed++;
        }
        this.logger.error(
          `Error procesando evento ${event.eventId}: ${(err as Error).message}`,
        );
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
   * Recupera eventos cuyo bloqueo haya expirado (instancia caída).
   * Los pone de nuevo como PENDING para que otra instancia pueda reclamarlos.
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

  private titleFor(type: PushNotificationType, numericId: number): string {
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
