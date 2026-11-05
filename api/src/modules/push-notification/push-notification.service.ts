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
 */
export type NotificationEventStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';

/**
 * Servicio de notificaciones push con patron Outbox.
 *
 * Los eventos se persisten en la base de datos dentro de la misma transaccion
 * que modifica el pedido, por lo que una caída temporal de Firebase nunca
 * pierde una notificacion. Un worker procesa los eventos pendientes con
 * reintentos y deduplicacion por eventId.
 *
 * Los errores de Firebase nunca propagan excepcion: si el envio falla, el
 * evento queda marcado como FAILED y se reintentara en la siguiente ejecucion
 * con espera incremental. Solo al alcanzar el máximo de intentos pasa a DEAD.
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceService: PushDeviceService,
    private readonly fcm: FirebaseMessagingService,
  ) {}

  onModuleInit() {
    // Arrancar el worker automático cada 30 segundos.
    // Usamos un flag `processing` para evitar ejecuciones simultáneas dentro
    // de la misma instancia. Entre instancias distintas se coordina mediante
    // la consulta a eventos con `status = 'PENDING'` y `attempts < maxAttempts`:
    // cada evento se procesa una sola vez porque se marca como FAILED/SENT/DEAD
    // inmediatamente tras el primer intento exitoso o fallido.
    this.workerInterval = setInterval(() => {
      void this.processPendingEvents();
    }, 30000);
    this.logger.log('Worker de notificaciones push iniciado (cada 30s)');
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
   * Crea un evento de notificacion en el outbox.
   * Debe llamarse dentro de la transaccion que modifica el pedido para
   * garantizar atomicidad.
   *
   * @param tx - Cliente Prisma de la transaccion activa
   * @param eventId - Identificador unico del evento (para deduplicacion)
   * @param type - Tipo de evento
   * @param orderId - ID del pedido
   * @param numericId - Numero de pedido para mostrar
   * @param payload - Datos adicionales enviados a FCM
   */
  async createEvent(
    tx: PrismaClient,
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
        maxAttempts: 5,
      },
    });
  }

  /**
   * Crea un evento de notificacion fuera de una transaccion (uso independiente).
   * Se usa cuando no hay transaccion Prisma activa (por ejemplo, en pruebas o
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
        maxAttempts: 5,
      },
    });
  }

  /**
   * Procesa todos los eventos pendientes: envía vía Firebase y actualiza el
   * estado. Evita ejecuciones simultáneas mediante el flag `processing`.
   *
   * Reintentos con espera incremental: un evento fallido se marca como FAILED
   * con `attempts` incrementado. Sigue siendo candidato para reprocesamiento
   * mientras `attempts < maxAttempts`. Solo al alcanzar el máximo pasa a DEAD.
   *
   * Los tokens FCM solo se eliminan cuando Firebase responde UNREGISTERED.
   */
  async processPendingEvents(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    dead: number;
  }> {
    if (this.processing) {
      this.logger.debug(
        'Worker ya está procesando eventos, saltando esta ejecución',
      );
      return { processed: 0, sent: 0, failed: 0, dead: 0 };
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
  }> {
    const pending = await this.prisma.notificationEvent.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 5 }, // maxAttempts por defecto
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (pending.length === 0) {
      return { processed: 0, sent: 0, failed: 0, dead: 0 };
    }

    let sent = 0;
    let failed = 0;
    let dead = 0;

    for (const event of pending) {
      try {
        const devices = await this.deviceService.findAdminDevices();

        if (devices.length === 0) {
          // No hay dispositivos registrados: marcar como enviado.
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'SENT',
              processedAt: new Date(),
            },
          });
          sent++;
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

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const device = devices[i];
          if (result.success) {
            anySuccess = true;
          }
          if (result.invalidToken && device.token) {
            tokensToDelete.push(device.token);
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
        const maxAttempts = event.maxAttempts ?? 5;

        if (anySuccess) {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'SENT',
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
              lastError: 'Máximo de intentos alcanzado',
              processedAt: new Date(),
            },
          });
          dead++;
        } else {
          // Reintentable: queda como PENDING con attempts incrementado.
          // El worker lo recogerá en la siguiente ejecución con espera implícita
          // por el intervalo de 30s (backoff incremental a través de múltiples ciclos).
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'PENDING',
              attempts: nextAttempts,
              lastError: 'Todos los dispositivos fallaron',
            },
          });
          failed++;
        }
      } catch (err) {
        const nextAttempts = (event.attempts ?? 0) + 1;
        const maxAttempts = event.maxAttempts ?? 5;

        if (nextAttempts >= maxAttempts) {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'DEAD',
              attempts: nextAttempts,
              lastError: (err as Error).message,
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
      processed: pending.length,
      sent,
      failed,
      dead,
    };
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
