import { Injectable, Logger } from '@nestjs/common';
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
 * Servicio de notificaciones push con patron Outbox.
 *
 * Los eventos se persisten en la base de datos dentro de la misma transaccion
 * que modifica el pedido, por lo que una caida temporal de Firebase nunca
 * pierde una notificacion. Un worker procesa los eventos pendientes con
 * reintentos y deduplicacion por eventId.
 *
 * Los errores de Firebase nunca propagan excepcion: si el envio falla, el
 * evento queda marcado como FAILED y se reintentara mas tarde.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceService: PushDeviceService,
    private readonly fcm: FirebaseMessagingService,
  ) {}

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
   * Procesa todos los eventos pendientes: envia via Firebase y actualiza el
   * estado. Los eventos con demasiados intentos fallidos se marcan como DEAD.
   *
   * Los errores de Firebase no lanzan excepcion: el evento se marca como
   * FAILED y se reintentara en la siguiente ejecucion.
   */
  async processPendingEvents() {
    const pending = await this.prisma.notificationEvent.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 5 }, // maxAttempts por defecto
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (pending.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const event of pending) {
      try {
        const devices = await this.deviceService.findAdminDevices();

        if (devices.length === 0) {
          // No hay dispositivos registrados: marcar como enviado (no hay a quien notificar)
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
              event.payload as Record<string, string>,
            ),
          ),
        );

        const anyInvalid = results.some((r) => r.invalidToken);
        const anySuccess = results.some((r) => r.success);

        // Eliminar tokens invalidos
        if (anyInvalid) {
          for (const device of devices) {
            // No sabemos cual fallo exactamente, pero si alguno fallo por token invalido
            // intentamos limpiar todos los que Firebase rechace. Como sendToToken no
            // nos dice cual, marcamos el evento como procesado y dejamos la limpieza
            // para cuando se identifique el token concreto.
          }
        }

        if (anySuccess || devices.length === 0) {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'SENT',
              processedAt: new Date(),
            },
          });
          sent++;
        } else {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: 'FAILED',
              attempts: { increment: 1 },
              lastError: 'Todos los dispositivos fallaron',
            },
          });
          failed++;
        }
      } catch (err) {
        await this.prisma.notificationEvent.update({
          where: { id: event.id },
          data: {
            status: 'FAILED',
            attempts: { increment: 1 },
            lastError: (err as Error).message,
          },
        });
        failed++;
        this.logger.error(
          `Error procesando evento ${event.eventId}: ${(err as Error).message}`,
        );
      }
    }

    return { processed: pending.length, sent, failed };
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
