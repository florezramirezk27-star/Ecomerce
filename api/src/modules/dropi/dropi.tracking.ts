import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { MailService } from '../mail/mail.service';
import { DropiTrackingData, DROPI_STATUS_MAP } from './dropi.types';

/** Pedazo de `GET /api/orders/myorders/{id}` que de verdad se usa. */
interface DropiOrderEstado {
  id?: number | string;
  status?: string;
  shipping_guide?: string | null;
  shipping_company?: string | null;
  updated_at?: string | number | null;
}

/** Pedazo de la respuesta de `GET /api/products/v4/index` que se usa al rastrear por guía. */
interface TrackGuideObject {
  status?: string;
  last_event?: string;
  status_detail?: string;
  carrier?: string;
  transportadora?: string;
}

interface TrackGuideResponse {
  isSuccess?: boolean;
  objects?: TrackGuideObject[];
}

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

    const { statusCode, data: initialData } = await this.client.request(
      '/api/products/v4/index',
      'POST',
      {
        search_type: 'guide',
        keywords: guideId,
      },
      token,
    );

    let data = initialData;

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = null;
    }

    // Se tipa la respuesta igual que consultarEstadoPorId para no arrastrar el
    // `any` de JSON.parse por todo el método.
    const respuesta = parsed as TrackGuideResponse | null;

    if (!respuesta?.isSuccess || !respuesta?.objects?.length) {
      return null;
    }

    const trackingData = respuesta.objects[0];

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

    if (!tracking) {
      return null;
    }

    if (tracking.dropiGuideId) {
      return this.trackByGuide(tracking.dropiGuideId);
    }

    if (!tracking.dropiOrderId) {
      return null;
    }

    // Sin guía de envío (Dropi recién creó el pedido): se le pregunta a Dropi
    // por el id del pedido, que responde desde el minuto cero y además trae la
    // guía. Antes esto devolvía null y por eso ningún pedido nuevo podía
    // avanzar de estado.
    return this.consultarEstadoPorId(tracking.dropiOrderId);
  }

  /**
   * `GET /api/orders/myorders/{id}`: estado real del pedido en Dropi sin
   * necesidad de guía de envío. Devuelve `status` ("PENDIENTE", "CANCELADO",
   * ...) y `shipping_guide` en cuanto Dropi tenga algo que reportar.
   */
  private async consultarEstadoPorId(
    dropiOrderId: string,
  ): Promise<DropiTrackingData | null> {
    let token = await this.auth.getToken();

    const pedir = () =>
      this.client.request(
        `/api/orders/myorders/${dropiOrderId}`,
        'GET',
        undefined,
        token,
      );

    let { statusCode, data } = await pedir();

    if (statusCode === 401) {
      this.auth.invalidateToken();
      token = await this.auth.getToken();

      const retry = await pedir();
      if (retry.statusCode === 401) {
        throw new Error('Dropi token renew failed during tracking');
      }
      ({ statusCode, data } = retry);
    }

    if (statusCode === 404) {
      // Dropi ya no lo tiene: eso no es un estado, lo resuelve syncDeletedOrders.
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = null;
    }

    // `{ objects: {...} }` (a veces llega como arreglo). Se tipa explicitamente
    // para no arrastrar el `any` de JSON.parse por todo el metodo.
    const crudo = (parsed as { objects?: unknown } | null)?.objects;
    const orden = (Array.isArray(crudo) ? crudo[0] : crudo) as
      DropiOrderEstado | null | undefined;

    if (statusCode !== 200 || !orden?.status) {
      return null;
    }

    const guide =
      typeof orden.shipping_guide === 'string' && orden.shipping_guide
        ? orden.shipping_guide
        : null;

    return {
      status: String(orden.status),
      lastEvent: guide ? `Guía ${guide}` : `Estado en Dropi: ${orden.status}`,
      carrier:
        typeof orden.shipping_company === 'string'
          ? orden.shipping_company
          : null,
      guide,
      // Solo lo útil: el objeto completo trae `history`, `orderdetails` y media
      // docena de campos enormes que no aportan y sí pesan en la BD.
      rawResponse: {
        id: orden.id ?? null,
        status: orden.status,
        shipping_guide: guide,
        shipping_company: orden.shipping_company ?? null,
        updated_at: orden.updated_at ?? null,
      },
    };
  }

  translateStatus(dropiStatus: string | null): string {
    if (!dropiStatus) return 'PENDING';
    return DROPI_STATUS_MAP[this.normalizarEstado(dropiStatus)] || 'PENDING';
  }

  /**
   * Dropi responde en español y sin uniformidad ("CANCELADO", "En tránsito",
   * "en proceso"), mientras que el mapa está en mayúsculas y con guiones bajos.
   * Sin normalizar, todo estado que no fuera literal caía a PENDING y los
   * pedidos nunca avanzaban.
   */
  private normalizarEstado(estado: string): string {
    return estado
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, '_');
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
        rawResponse: (data.rawResponse || null) as Prisma.InputJsonValue,
        checkedAt: now,
      },
      update: {
        ...(data.dropiOrderId && { dropiOrderId: data.dropiOrderId }),
        ...(data.dropiGuideId && { dropiGuideId: data.dropiGuideId }),
        ...(data.carrier && { carrier: data.carrier }),
        ...(data.status && { status: data.status }),
        ...(data.lastEvent && { lastEvent: data.lastEvent }),
        rawResponse: (data.rawResponse || undefined) as Prisma.InputJsonValue,
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
      // Se permiten los saltos (PENDING → SHIPPED → DELIVERED encadenados no
      // siempre se reportan: Dropi a veces salta estados o el pedido se quedó
      // en PENDING por un fallo técnico y aun así se creó). Si no se permitiera
      // el salto directo, esos pedidos quedarían colgados para siempre.
      PENDING: ['PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
      PAID: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
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
          data: { status: translatedDropiStatus as OrderStatus },
        });
        this.logger.log(
          `Pedido ${orderId}: ${currentOrderStatus} → ${translatedDropiStatus} (Dropi: ${trackingData.status})`,
        );
      }
    }

    await this.upsertTracking(orderId, {
      status: trackingData.status,
      lastEvent: trackingData.lastEvent,
      carrier: trackingData.carrier,
      dropiGuideId: trackingData.guide,
      rawResponse: trackingData.rawResponse as Prisma.InputJsonValue,
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
      } catch (err: unknown) {
        this.logger.error(
          `Sync failed for order ${order.id}: ${(err as Error).message}`,
        );
      }
    }

    return updates;
  }

  async fetchDropiOrderStatus(dropiOrderId: string): Promise<{
    found: boolean;
    deleted: boolean;
    status: string | null;
    raw: unknown;
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
    } catch (err: unknown) {
      this.logger.error(
        `fetchDropiOrderStatus falló para ${dropiOrderId}: ${(err as Error).message}`,
      );
      return { found: true, deleted: false, status: null, raw: null };
    }
  }

  async syncDeletedOrders(): Promise<
    {
      orderId: string;
      dropiOrderId: string;
      previous: string;
      current: string;
      reason: string;
    }[]
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
      } catch (err: unknown) {
        this.logger.error(
          `Sync de envío Dropi falló para orden ${order.id} (${dropiOrderId}): ${(err as Error).message}`,
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
