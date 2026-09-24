import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { MailService } from '../mail/mail.service';
import { DropiTrackingData, DROPI_STATUS_MAP } from './dropi.types';

@Injectable()
export class DropiTrackingService {
  private readonly logger = new Logger(DropiTrackingService.name);

  constructor(
    private readonly client: DropiClient,
    private readonly auth: DropiAuthService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async trackByGuide(guideId: string): Promise<DropiTrackingData | null> {
    let token = await this.auth.getToken();

    let { statusCode, data } = await this.client.request(
      '/api/products/v4/index',
      'POST',
      {
        search_type: 'guide',
        keywords: guideId,
      },
      token,
    );

    if (statusCode === 401) {
      this.auth.invalidateToken();
      token = await this.auth.getToken();

      const retry = await this.client.request(
        '/api/products/v4/index',
        'POST',
        {
          search_type: 'guide',
          keywords: guideId,
        },
        token,
      );

      if (retry.statusCode === 401) {
        throw new Error('Dropi token renew failed during tracking');
      }

      data = retry.data;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = data;
    }

    if (!parsed?.isSuccess || !parsed?.objects?.length) {
      return null;
    }

    const trackingData = parsed.objects[0];

    return {
      status: trackingData.status || 'UNKNOWN',
      lastEvent:
        trackingData.last_event ||
        trackingData.status_detail ||
        'Sin eventos registrados',
      carrier: trackingData.carrier || trackingData.transportadora || 'Dropi',
      rawResponse: trackingData,
    };
  }

  async trackByOrderId(orderId: string): Promise<DropiTrackingData | null> {
    const tracking = await this.prisma.orderTracking.findUnique({
      where: { orderId },
    });

    if (!tracking?.dropiGuideId) {
      return null;
    }

    return this.trackByGuide(tracking.dropiGuideId);
  }

  translateStatus(dropiStatus: string | null): string {
    if (!dropiStatus) return 'PENDING';
    return DROPI_STATUS_MAP[dropiStatus] || 'PENDING';
  }

  async upsertTracking(
    orderId: string,
    data: {
      dropiOrderId?: string | null;
      dropiGuideId?: string | null;
      carrier?: string | null;
      status?: string | null;
      lastEvent?: string | null;
      rawResponse?: any;
    },
  ): Promise<void> {
    const now = new Date();

    await this.prisma.orderTracking.upsert({
      where: { orderId },
      create: {
        orderId,
        dropiOrderId: data.dropiOrderId || null,
        dropiGuideId: data.dropiGuideId || null,
        carrier: data.carrier || null,
        status: data.status || 'PENDING',
        lastEvent: data.lastEvent || null,
        rawResponse: data.rawResponse || null,
        checkedAt: now,
      },
      update: {
        ...(data.dropiOrderId && { dropiOrderId: data.dropiOrderId }),
        ...(data.dropiGuideId && { dropiGuideId: data.dropiGuideId }),
        ...(data.carrier && { carrier: data.carrier }),
        ...(data.status && { status: data.status }),
        ...(data.lastEvent && { lastEvent: data.lastEvent }),
        rawResponse: data.rawResponse || undefined,
        checkedAt: now,
      },
    });
  }

  async syncOrderStatus(orderId: string): Promise<{
    synced: boolean;
    previousStatus: string;
    newStatus: string;
    dropiStatus: string;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        user: true,
        tracking: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const trackingData = await this.trackByOrderId(orderId);

    if (!trackingData) {
      return {
        synced: false,
        previousStatus: order.status,
        newStatus: order.status,
        dropiStatus: 'UNKNOWN',
      };
    }

    const translatedDropiStatus = this.translateStatus(trackingData.status);
    const currentOrderStatus = order.status;

    const VALID_TRANSITIONS: Record<string, string[]> = {
      PENDING: ['PAID', 'CANCELLED'],
      PAID: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    };

    const allowed = VALID_TRANSITIONS[currentOrderStatus] || [];
    const canTransition = allowed.includes(translatedDropiStatus);

    if (canTransition && translatedDropiStatus !== currentOrderStatus) {
      if (translatedDropiStatus === 'CANCELLED') {
        await this.markCancelled(
          order,
          `Cancelada en Dropi (${trackingData.status || 'CANCELADO'})`,
        );
      } else {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: translatedDropiStatus as any },
        });
      }
    }

    await this.upsertTracking(orderId, {
      status: trackingData.status,
      lastEvent: trackingData.lastEvent,
      carrier: trackingData.carrier,
      rawResponse: trackingData.rawResponse,
    });

    return {
      synced: canTransition,
      previousStatus: currentOrderStatus,
      newStatus: canTransition ? translatedDropiStatus : currentOrderStatus,
      dropiStatus: trackingData.status || 'UNKNOWN',
    };
  }

  async syncAllPendingOrders(): Promise<
    { orderId: string; previous: string; current: string; dropi: string }[]
  > {
    const pendingOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PAID', 'SHIPPED'] },
        tracking: { isNot: null },
      },
      include: { tracking: true },
    });

    const updates: {
      orderId: string;
      previous: string;
      current: string;
      dropi: string;
    }[] = [];

    for (const order of pendingOrders) {
      try {
        const result = await this.syncOrderStatus(order.id);
        if (result.synced) {
          updates.push({
            orderId: order.id,
            previous: result.previousStatus,
            current: result.newStatus,
            dropi: result.dropiStatus,
          });
        }
      } catch (err: any) {
        this.logger.error(`Sync failed for order ${order.id}: ${err.message}`);
      }
    }

    return updates;
  }

  async fetchDropiOrderStatus(dropiOrderId: string): Promise<{
    found: boolean;
    deleted: boolean;
    status: string | null;
    raw: any;
  }> {
    const order = await this.prisma.order.findFirst({
      where: { tracking: { dropiOrderId } },
      include: {
        tracking: true,
        user: true,
        items: true,
      },
    });

    if (!order?.tracking?.dropiGuideId) {
      return { found: true, deleted: false, status: null, raw: null };
    }

    try {
      const info = await this.trackByGuide(order.tracking.dropiGuideId);
      if (info === null) {
        const stale =
          order.tracking.checkedAt &&
          Date.now() - new Date(order.tracking.checkedAt).getTime() >
            6 * 60 * 60 * 1000;
        return {
          found: !(stale === true),
          deleted: stale === true,
          status: null,
          raw: null,
        };
      }
      return {
        found: true,
        deleted: false,
        status: info.status,
        raw: info.rawResponse,
      };
    } catch (err: any) {
      this.logger.error(
        `fetchDropiOrderStatus falló para ${dropiOrderId}: ${err.message}`,
      );
      return { found: true, deleted: false, status: null, raw: null };
    }
  }

  async syncDeletedOrders(): Promise<
    { orderId: string; dropiOrderId: string; previous: string; current: string; reason: string }[]
  > {
    const pending = await this.prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED'] },
        tracking: {
          dropiOrderId: { not: null },
        },
      },
      include: {
        tracking: true,
        user: true,
        items: true,
      },
    });

    const results: {
      orderId: string;
      dropiOrderId: string;
      previous: string;
      current: string;
      reason: string;
    }[] = [];

    for (const order of pending) {
      const dropiOrderId = order.tracking!.dropiOrderId!;

      try {
        const info = await this.fetchDropiOrderStatus(dropiOrderId);
        if (!info.deleted) continue;

        this.logger.warn(
          `Dropi: envío ${dropiOrderId} de la orden ${order.id} fue eliminado en Dropi (${info.status || 'no encontrado en tracking'}). Cancelando en la tienda...`,
        );

        await this.markCancelled(
          order,
          info.status
            ? `Envío eliminado en Dropi (${info.status})`
            : 'Envío eliminado en Dropi',
        );

        results.push({
          orderId: order.id,
          dropiOrderId,
          previous: order.status,
          current: 'CANCELLED',
          reason: info.status || 'no encontrado en tracking',
        });
      } catch (err: any) {
        this.logger.error(
          `Sync de envío Dropi falló para orden ${order.id} (${dropiOrderId}): ${err.message}`,
        );
      }
    }

    if (results.length > 0) {
      this.logger.log(
        `Dropi: ${results.length} envío(s) eliminado(s) reflejados como cancelados en la tienda`,
      );
    }

    return results;
  }

  private async markCancelled(
    order: {
      id: string;
      status: string;
      shippingEmail: string | null;
      shippingName: string | null;
      user?: { name: string; email: string } | null;
      items: { productId: string; quantity: number }[];
      tracking?: { carrier: string | null } | null;
    },
    detail: string,
  ): Promise<void> {
    if (order.status === 'CANCELLED') return;

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });
    });

    const customerEmail = order.shippingEmail || order.user?.email || null;
    if (customerEmail) {
      void this.mailService
        .sendOrderStatusEmail(
          customerEmail,
          order.user?.name || order.shippingName || 'Cliente',
          order.id,
          'CANCELLED',
        )
        .then(
          () => {
            this.logger.log(
              `Cancelación notificada a ${customerEmail} (orden ${order.id}): ${detail}`,
            );
          },
          (err) => {
            this.logger.error(
              `Error avisando cancelación (${order.id}): ${err instanceof Error ? err.message : err}`,
            );
          },
        );
    }
  }
}
