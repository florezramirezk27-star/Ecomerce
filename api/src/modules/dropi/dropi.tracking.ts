import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { DropiTrackingData, DROPI_STATUS_MAP } from './dropi.types';

@Injectable()
export class DropiTrackingService {
  private readonly logger = new Logger(DropiTrackingService.name);

  constructor(
    private readonly client: DropiClient,
    private readonly auth: DropiAuthService,
    private readonly prisma: PrismaService,
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
}
