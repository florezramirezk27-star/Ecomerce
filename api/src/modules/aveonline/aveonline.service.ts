import { Injectable } from '@nestjs/common';
import { AveonlineAuthService } from './aveonline.auth';
import { AveonlineProductsService } from './aveonline.products';
import { AveonlineOrdersService } from './aveonline.orders';
import { AveonlineTrackingService } from './aveonline.tracking';
import {
  AveonlineCreateOrderRequest,
  AveonlineCreateOrderResponse,
  AveonlineProvider,
} from './aveonline.types';

@Injectable()
export class AveonlineService {
  constructor(
    private readonly auth: AveonlineAuthService,
    private readonly products: AveonlineProductsService,
    private readonly orders: AveonlineOrdersService,
    private readonly tracking: AveonlineTrackingService,
  ) {}

  async login(): Promise<void> {
    return this.auth.login();
  }

  getStatus() {
    return {
      ...this.auth.getStatus(),
      webhookConfigured: !!process.env.AVEONLINE_WEBHOOK_TOKEN,
    };
  }

  async forceRelogin() {
    this.auth.invalidateToken();
    await this.auth.login();
    return this.auth.getStatus();
  }

  async listProviders(): Promise<AveonlineProvider[]> {
    return this.products.fetchProviders();
  }

  async createOrder(
    data: AveonlineCreateOrderRequest,
  ): Promise<AveonlineCreateOrderResponse> {
    return this.orders.createOrder(data);
  }

  async sendOrder(orderId: string): Promise<AveonlineCreateOrderResponse> {
    return this.orders.sendOrder(orderId);
  }

  async trackByOrderId(orderId: string) {
    return this.tracking.trackByOrderId(orderId);
  }

  translateStatus(aveonlineStatus: string | null): string {
    return this.tracking.translateStatus(aveonlineStatus);
  }

  async handleWebhook(payload: any) {
    return this.tracking.handleWebhook(payload);
  }

  async registerWebhook(url: string) {
    return this.tracking.registerWebhook(url);
  }
}
