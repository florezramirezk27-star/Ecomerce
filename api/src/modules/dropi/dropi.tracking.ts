import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { MailService } from '../mail/mail.service';
import {
  DropiTrackingData,
  DROPI_STATUS_MAP,
  DROPI_API_HOST,
} from './dropi.types';

const DELETED_STATUSES = new Set([
  'CANCELADO',
  'CANCELLED',
  'CANCELED',
  'ELIMINADO',
  'DELETED',
  'REMOVED',
  'ANULADO',
  'REJECTED',
]);

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
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: translatedDropiStatus as any },
      });
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
    let token = await this.auth.getToken();
    let res = await this.client.request(
      `/api/orders/myorders/${dropiOrderId}`,
      'GET',
      undefined,
      token,
      DROPI_API_HOST,
    );

    if (res.statusCode === 401) {
      this.auth.invalidateToken();
      token = await this.auth.getToken();
      res = await this.client.request(
        `/api/orders/myorders/${dropiOrderId}`,
        'GET',
        undefined,
        token,
        DROPI_API_HOST,
      );
    }

    let body: any = {};
    try {
      body = JSON.parse(res.data);
    } catch {
      body = { raw: res.data };
    }

    const found = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;

    const rawStatus = this.findStatus(body);
    const deleted =
      !found ||
      (rawStatus ? DELETED_STATUSES.has(String(rawStatus).toUpperCase()) : false);

    return {
      found,
      deleted,
      status: rawStatus,
      raw: body,
    };
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
        const isDeleted = info.deleted;

        if (!isDeleted) continue;

        this.logger.warn(
          `Dropi: envío ${dropiOrderId} de la orden ${order.id} fue eliminado en Dropi (${info.status || 'no encontrado'}). Cancelando en la tienda...`,
        );

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

        const customerEmail = order.shippingEmail || order.user?.email;
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
                  `Cancelación por Dropi notificada a ${customerEmail} (orden ${order.id})`,
                );
              },
              (err) => {
                this.logger.error(
                  `Error avisando cancelación por Dropi (${order.id}): ${err instanceof Error ? err.message : err}`,
                );
              },
            );
        }

        await this.upsertTracking(order.id, {
          status: 'CANCELLED',
          lastEvent: info.found
            ? `Envío eliminado en Dropi (${info.status})`
            : 'Envío eliminado/inexistente en Dropi',
          carrier: order.tracking?.carrier,
        });

        results.push({
          orderId: order.id,
          dropiOrderId,
          previous: order.status,
          current: 'CANCELLED',
          reason: info.found ? info.status || 'eliminado' : 'no encontrado',
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

  private findStatus(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;

    for (const key of ['status', 'estado', 'order_status', 'new_status']) {
      const v = obj[key];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }

    const nested = obj.order || obj.data || obj.order_data;
    if (nested && typeof nested === 'object') {
      return this.findStatus(nested);
    }

    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        const found = this.findStatus(obj[k]);
        if (found) return found;
      }
    }

    return null;
  }
}
