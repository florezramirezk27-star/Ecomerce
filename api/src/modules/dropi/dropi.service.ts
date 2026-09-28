import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { DropiAuthService } from './dropi.auth';
import { DropiProductsService } from './dropi.products';
import { DropiOrdersService } from './dropi.orders';
import { DropiTrackingService } from './dropi.tracking';
import { DropiSyncService, StockSyncSummary } from './dropi.sync';
import {
  DropiCancelResult,
  DropiCatalogBody,
  DropiCreateOrderRequest,
  DropiCreateOrderResponse,
  DropiFinalOrderResult,
  DropiQuoteParams,
  DropiQuoteResult,
  DropiStockItem,
  DropiStockValidation,
  DropiTrackingData,
} from './dropi.types';

/**
 * Forma maxima del payload de webhook que se acepta.
 *
 * Antes se aceptaba `any` sin limite y `rawResponse` guardaba el cuerpo entero.
 * Ahora el cuerpo se acota, lo que evita que un payload enorme se quede
 * persistido en la base de datos.
 */
const webhookPayloadSchema = z
  .object({
    order_local_id: z.string().max(64).optional(),
    orderId: z.string().max(64).optional(),
    local_order_id: z.string().max(64).optional(),
    order_id: z.string().max(64).optional(),
    guide: z.string().max(64).optional(),
    guide_id: z.string().max(64).optional(),
    guideId: z.string().max(64).optional(),
    num_guia: z.string().max(64).optional(),
    guia: z.string().max(64).optional(),
    tracking_number: z.string().max(64).optional(),
    status: z.string().max(64).optional(),
    estado: z.string().max(64).optional(),
    new_status: z.string().max(64).optional(),
    last_event: z.string().max(500).optional(),
    novedad: z.string().max(500).optional(),
  })
  .catchall(z.unknown());

/** Formato de identificador que usa Prisma para los pedidos. */
const CUID_PATTERN = /^c[0-9a-z]{20,32}$/;

@Injectable()
export class DropiService {
  private readonly logger = new Logger(DropiService.name);

  constructor(
    private readonly auth: DropiAuthService,
    private readonly products: DropiProductsService,
    private readonly orders: DropiOrdersService,
    private readonly tracking: DropiTrackingService,
    private readonly sync: DropiSyncService,
  ) {}

  async login(): Promise<void> {
    return this.auth.login();
  }

  getStatus(): { connected: boolean; email: string } {
    return this.auth.getStatus();
  }

  async forceRelogin(): Promise<{ connected: boolean; email: string }> {
    this.auth.invalidateToken();
    await this.auth.login();
    return this.auth.getStatus();
  }

  async getDropiProducts(body?: object): Promise<any> {
    return this.products.fetchCatalog(body as DropiCatalogBody);
  }

  async importProduct(dropiProductId: number): Promise<any> {
    return this.products.importProduct(dropiProductId);
  }

  async validateStock(items: DropiStockItem[]): Promise<DropiStockValidation> {
    return this.products.validateStock(items);
  }

  async createFinalOrder(
    payload: Record<string, any>,
  ): Promise<DropiFinalOrderResult> {
    return this.orders.createFinalOrder(payload);
  }

  async cancelOrder(dropiOrderId: number): Promise<DropiCancelResult> {
    return this.orders.cancelOrder(dropiOrderId);
  }

  async quoteShipping(params: DropiQuoteParams): Promise<DropiQuoteResult> {
    return this.orders.quoteShipping(params);
  }

  async createOrder(
    data: DropiCreateOrderRequest,
    orderId?: string,
  ): Promise<DropiCreateOrderResponse> {
    const result = await this.orders.createOrder(data);

    if (orderId && result.results?.length) {
      const firstOk = result.results.find((r) => r.dropiOrderId);
      const guideId =
        firstOk?.dropiGuideId ||
        result.results.find((r) => r.dropiGuideId)?.dropiGuideId ||
        null;

      await this.tracking.upsertTracking(orderId, {
        dropiOrderId:
          firstOk?.dropiOrderId || result.results[0]?.dropiOrderId || null,
        dropiGuideId: guideId,
        carrier: firstOk?.carrier || result.results[0]?.carrier || 'Dropi',
        status: result.message || (result.success ? 'CREATED' : 'ERROR'),
        lastEvent: result.success
          ? 'Orden creada en Dropi'
          : 'Error al crear orden(es) en Dropi',
        rawResponse: result.results,
      });
    }

    return result;
  }

  async trackByGuide(guideId: string): Promise<DropiTrackingData | null> {
    return this.tracking.trackByGuide(guideId);
  }

  async trackByOrderId(orderId: string): Promise<DropiTrackingData | null> {
    return this.tracking.trackByOrderId(orderId);
  }

  translateStatus(dropiStatus: string): string {
    return this.tracking.translateStatus(dropiStatus);
  }

  async syncOrderStatus(orderId: string): Promise<any> {
    return this.tracking.syncOrderStatus(orderId);
  }

  async syncAllPendingOrders(): Promise<any> {
    return this.tracking.syncAllPendingOrders();
  }

  async syncDeletedOrders(): Promise<any> {
    return this.tracking.syncDeletedOrders();
  }

  async syncStock(targetIds?: number[]): Promise<StockSyncSummary> {
    return this.sync.syncStock(targetIds);
  }

  async handleWebhook(payload: unknown): Promise<{ received: boolean }> {
    const parsed = webhookPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(
        `Webhook de Dropi con payload invalido: ${parsed.error.issues[0]?.message}`,
      );
      return { received: false };
    }

    const body = parsed.data as Record<string, unknown>;

    const orderId = this.findField(body, [
      'order_local_id',
      'orderId',
      'local_order_id',
      'order_id',
    ]);
    const guideId = this.findField(body, [
      'guide',
      'guide_id',
      'guideId',
      'num_guia',
      'guia',
      'tracking_number',
    ]);
    const status = this.findField(body, ['status', 'estado', 'new_status']);

    if (!orderId) {
      return { received: false };
    }

    // Los pedidos usan CUID. Rechazar cualquier otro formato evita que un
    // payload manipulado apunte a filas ajenas por colision de clave.
    if (!CUID_PATTERN.test(orderId)) {
      this.logger.warn(`Webhook de Dropi con order_id invalido: ${orderId}`);
      return { received: false };
    }

    const lastEvent = this.findField(body, ['last_event', 'novedad']);

    await this.tracking.upsertTracking(orderId, {
      dropiGuideId: guideId,
      status: status || 'UNKNOWN',
      lastEvent,
      rawResponse: body,
    });

    if (status) {
      await this.tracking.syncOrderStatus(orderId);
    }

    return { received: true };
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
}
