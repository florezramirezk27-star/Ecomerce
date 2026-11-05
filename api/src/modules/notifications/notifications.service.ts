import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmPushService } from './fcm-push.service';

interface OutboxRecord {
  id: string;
  type: string;
  aggregateId: string;
  attempts: number;
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmPushService,
  ) {}

  onModuleInit(): void {
    // La bandeja outbox hace duradero el evento entre la creación del pedido
    // y el envío push. El worker reintenta fallos transitorios.
    this.timer = setInterval(() => {
      void this.processPending();
    }, 5_000);
    this.timer.unref?.();
    void this.processPending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async registerDevice(
    userId: string,
    input: { token: string; platform: string },
  ) {
    return this.prisma.pushDevice.upsert({
      where: { token: input.token },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: input.platform,
        lastSeenAt: new Date(),
      },
      select: { id: true, platform: true, lastSeenAt: true },
    });
  }

  async unregisterDevice(userId: string, token: string) {
    const result = await this.prisma.pushDevice.deleteMany({
      where: { userId, token },
    });
    return { removed: result.count > 0 };
  }

  async listForAdmin(userId: string, requestedLimit = 30) {
    const take = Math.min(Math.max(Math.trunc(requestedLimit) || 30, 1), 100);
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count > 0 };
  }

  private async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const now = new Date();
      const staleLock = new Date(now.getTime() - 120_000);
      await this.prisma.outboxEvent.updateMany({
        where: { status: 'PROCESSING', lockedAt: { lt: staleLock } },
        data: { status: 'PENDING', lockedAt: null },
      });

      const pending = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING', availableAt: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: { id: true, type: true, aggregateId: true, attempts: true },
      });

      for (const event of pending) {
        await this.processOne(event);
      }
    } catch (error) {
      this.logger.error(
        `No se pudo procesar la cola de notificaciones: ${this.errorMessage(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private async processOne(event: OutboxRecord): Promise<void> {
    const lockedAt = new Date();
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        lockedAt,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return;

    try {
      if (event.type === 'ORDER_CREATED') {
        await this.notifyAdminsOfOrder(event.aggregateId);
      } else {
        throw new Error(`Tipo de evento outbox no soportado: ${event.type}`);
      }

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DONE',
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      const exhausted = attempts >= 8;
      const delayMs = Math.min(60 * 60_000, 5_000 * 2 ** Math.min(attempts, 8));
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          availableAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lastError: this.errorMessage(error).slice(0, 1_000),
        },
      });
      this.logger.error(
        `Evento ${event.id} falló (intento ${attempts}${exhausted ? ', agotado' : ''}): ${this.errorMessage(error)}`,
      );
    }
  }

  private async notifyAdminsOfOrder(orderId: string): Promise<void> {
    const [order, admins] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          numericId: true,
          total: true,
          shippingName: true,
        },
      }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      }),
    ]);

    if (!order || admins.length === 0) return;

    const title = `Nuevo pedido #${order.numericId}`;
    const customer = order.shippingName?.trim() || 'Un cliente';
    const formattedTotal = new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 0,
    }).format(Number(order.total));
    const body = `${customer} · $${formattedTotal} COP · Contraentrega`;
    const eventKey = `ORDER_CREATED:${order.id}`;
    const data = {
      type: 'ORDER_CREATED',
      orderId: order.id,
      numericId: String(order.numericId),
    };

    // El historial in-app queda guardado incluso si Firebase aún no está
    // configurado o el dispositivo no tiene permiso para mostrar push.
    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        orderId: order.id,
        eventKey,
        type: 'ORDER_CREATED',
        title,
        body,
        data,
      })),
      skipDuplicates: true,
    });

    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: { in: admins.map((admin) => admin.id) } },
      select: { id: true, token: true },
    });

    // Se intenta cada dispositivo por separado; un token expirado no debe
    // impedir que los demás administradores reciban el aviso.
    for (const device of devices) {
      const result = await this.fcm.sendToDevice({
        token: device.token,
        title,
        body,
        data,
      });
      if (result === 'unregistered') {
        await this.prisma.pushDevice.deleteMany({ where: { id: device.id } });
      }
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
