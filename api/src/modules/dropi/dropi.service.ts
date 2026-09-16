import { Injectable } from '@nestjs/common';
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

@Injectable()
export class DropiService {
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

  async syncStock(targetIds?: number[]): Promise<StockSyncSummary> {
    return this.sync.syncStock(targetIds);
  }

  async handleWebhook(payload: any): Promise<{ received: boolean }> {
    const orderId = this.findField(payload, [
      'order_local_id',
      'orderId',
      'local_order_id',
      'order_id',
    ]);
    const guideId = this.findField(payload, [
      'guide',
      'guide_id',
      'guideId',
      'num_guia',
      'guia',
      'tracking_number',
    ]);
    const status = this.findField(payload, ['status', 'estado', 'new_status']);

    if (!orderId) {
      return { received: false };
    }

    await this.tracking.upsertTracking(orderId, {
      dropiGuideId: guideId,
      status: status || 'UNKNOWN',
      lastEvent: payload?.last_event || payload?.novedad || null,
      rawResponse: payload,
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
