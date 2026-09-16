import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AveonlineClient } from './aveonline.client';
import { AveonlineAuthService } from './aveonline.auth';
import {
  AVEONLINE_WEBHOOK_HOST,
  AVEONLINE_STATUS_MAP,
  AveonlineTrackingData,
  AveonlineWebhookPayload,
  AveonlineWebhookEstado,
} from './aveonline.types';

@Injectable()
export class AveonlineTrackingService {
  private readonly logger = new Logger(AveonlineTrackingService.name);
  private webhookToken = '';

  constructor(
    private readonly client: AveonlineClient,
    private readonly auth: AveonlineAuthService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async trackByOrderId(orderId: string): Promise<AveonlineTrackingData | null> {
    const tracking = await this.prisma.orderTracking.findUnique({
      where: { orderId },
    });

    if (!tracking) {
      return null;
    }

    return {
      status: tracking.status || 'UNKNOWN',
      lastEvent: tracking.lastEvent || 'Sin eventos registrados',
      carrier: tracking.carrier || 'Aveonline',
      rawResponse: tracking.rawResponse,
    };
  }

  translateStatus(aveonlineStatus: string | null): string {
    if (!aveonlineStatus) return 'PENDING';
    const normalized = this.normalizeStatus(aveonlineStatus);
    return AVEONLINE_STATUS_MAP[normalized] || 'PENDING';
  }

  async upsertTracking(
    orderId: string,
    data: {
      aveonlineOrderId?: string | null;
      aveonlineGuideId?: string | null;
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
        aveonlineOrderId: data.aveonlineOrderId || null,
        aveonlineGuideId: data.aveonlineGuideId || null,
        carrier: data.carrier || null,
        status: data.status || 'PENDING',
        lastEvent: data.lastEvent || null,
        rawResponse: data.rawResponse || null,
        checkedAt: now,
      },
      update: {
        ...(data.aveonlineOrderId && {
          aveonlineOrderId: data.aveonlineOrderId,
        }),
        ...(data.aveonlineGuideId && {
          aveonlineGuideId: data.aveonlineGuideId,
        }),
        ...(data.carrier && { carrier: data.carrier }),
        ...(data.status && { status: data.status }),
        ...(data.lastEvent && { lastEvent: data.lastEvent }),
        rawResponse: data.rawResponse || undefined,
        checkedAt: now,
      },
    });
  }

  async handleWebhook(payload: AveonlineWebhookPayload): Promise<{
    received: boolean;
    message?: string;
  }> {
    if (!this.webhookToken) {
      this.webhookToken =
        this.configService.get<string>('AVEONLINE_WEBHOOK_TOKEN') ?? '';
    }

    if (
      this.webhookToken &&
      payload.token &&
      payload.token !== this.webhookToken
    ) {
      this.logger.warn(
        'Webhook Aveonline rechazado: token de integración inválido',
      );
      return { received: false, message: 'invalid token' };
    }

    const orderRef = this.findField(payload, [
      'numeropedidoExterno',
      'numeroPedidoExterno',
      'num_pedido',
    ]);

    if (!orderRef) {
      this.logger.warn('Webhook Aveonline sin referencia de pedido local');
      return { received: false, message: 'missing order reference' };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderRef },
    });

    if (!order) {
      this.logger.warn(
        `Webhook Aveonline: pedido local ${orderRef} no encontrado`,
      );
      return { received: false, message: 'order not found' };
    }

    const guideId = this.findField(payload, ['guia', 'guiaId', 'tracking']);
    const estadoInfo = this.latestEstado(payload.estado);
    const rawStatus =
      estadoInfo?.nombre_estado ??
      this.findField(payload, [
        'estado_nombre',
        'estadoNombre',
        'status',
        'estado',
      ]) ??
      null;
    const fechaentrega = payload.fechaentrega || null;

    const lastEvent =
      estadoInfo?.comentarionovedad ??
      estadoInfo?.fechanovedad ??
      (fechaentrega ? `Entregado el ${fechaentrega}` : null);

    await this.upsertTracking(order.id, {
      aveonlineOrderId:
        payload.pedido_id != null ? String(payload.pedido_id) : undefined,
      aveonlineGuideId: guideId,
      status: rawStatus || 'UNKNOWN',
      lastEvent,
      rawResponse: payload,
    });

    const transitions: Record<string, string[]> = {
      PENDING: ['PAID', 'CANCELLED'],
      PAID: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    };

    const translated = this.translateStatus(rawStatus);
    const allowed = transitions[order.status] || [];
    if (
      translated &&
      translated !== order.status &&
      allowed.includes(translated)
    ) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: translated as any },
      });
      await this.upsertTracking(order.id, {
        status: rawStatus || 'UNKNOWN',
      });
    }

    return { received: true };
  }

  async registerWebhook(
    url: string,
  ): Promise<{ received: boolean; data?: any }> {
    const token = await this.auth.ensureConnected();

    const { statusCode, data } = await this.client.request(
      '/api-integrations/public/api/integrations/custom-webhook',
      'POST',
      {
        name: 'Kronio Market',
        webhookUrl: url,
      },
      token,
      AVEONLINE_WEBHOOK_HOST,
    );

    if (statusCode !== 200) {
      throw new Error(
        `Registro de webhook falló (${statusCode}): ${this.truncate(data)}`,
      );
    }

    const parsed = this.safeParse(data);
    const integrationToken = parsed?.data?.token ?? parsed?.token ?? null;
    if (integrationToken) {
      this.webhookToken = String(integrationToken);
    }

    return { received: true, data: parsed };
  }

  private latestEstado(
    estado: string | number | AveonlineWebhookEstado[] | undefined,
  ): AveonlineWebhookEstado | null {
    if (Array.isArray(estado)) {
      const last = estado[estado.length - 1];
      return last && typeof last === 'object' ? last : null;
    }
    if (estado && typeof estado === 'object') {
      return estado;
    }
    return null;
  }

  private normalizeStatus(estado: string): string {
    return this.stripAccents(estado).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  private stripAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private findField(obj: any, keys: string[]): string | null {
    if (!obj || typeof obj !== 'object') return null;

    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        return String(obj[key]);
      }
    }

    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        const found = this.findField(obj[k], keys);
        if (found) return found;
      }
    }

    return null;
  }

  private safeParse(data: string): any {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private truncate(data: string, max = 400): string {
    return data.length > max ? `${data.substring(0, max)}...` : data;
  }
}
