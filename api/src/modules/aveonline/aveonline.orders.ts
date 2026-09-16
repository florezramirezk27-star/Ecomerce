import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AveonlineClient } from './aveonline.client';
import { AveonlineAuthService } from './aveonline.auth';
import { AveonlineTrackingService } from './aveonline.tracking';
import {
  AveonlineCreateOrderRequest,
  AveonlineCreateOrderResponse,
  AveonlineOrderResult,
  AveonlineOrderItem,
  AveonlineShippingInfo,
} from './aveonline.types';

@Injectable()
export class AveonlineOrdersService {
  private readonly logger = new Logger(AveonlineOrdersService.name);

  constructor(
    private readonly client: AveonlineClient,
    private readonly auth: AveonlineAuthService,
    private readonly prisma: PrismaService,
    private readonly tracking: AveonlineTrackingService,
  ) {}

  async createOrder(
    data: AveonlineCreateOrderRequest,
  ): Promise<AveonlineCreateOrderResponse> {
    const token = await this.auth.ensureConnected();
    const empresa = this.auth.getEmpresa();

    if (!empresa) {
      throw new Error('No se encontró el número de empresa.');
    }

    const grouped = this.groupByProvider(data.items);
    const results: AveonlineOrderResult[] = [];

    for (const [providerIdStr, items] of grouped) {
      const providerId = Number(providerIdStr);
      const result = await this.createSingleOrder(
        items,
        data.shipping,
        token,
        empresa,
        data.numeropedidoExterno,
        providerId,
      );
      results.push(result);
    }

    const allOk = results.every(
      (r) => r.aveonlineOrderId || r.aveonlineGuideId,
    );

    return {
      success: allOk,
      message: results
        .map((r) =>
          r.aveonlineOrderId
            ? `Aveonline OK: ${r.aveonlineOrderId}`
            : `Aveonline falló: ${r.status || 'sin respuesta'}`,
        )
        .join(' | '),
      results,
    };
  }

  async sendOrder(orderId: string): Promise<AveonlineCreateOrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      throw new Error(`Orden ${orderId} no encontrada.`);
    }

    const aveItems = order.items.filter(
      (i) => i.product.aveonlineProductRef && i.product.aveonlineProviderId,
    );

    if (aveItems.length === 0) {
      throw new Error(
        'Ningún producto del pedido tiene referencia y proveedor Aveonline configurados.',
      );
    }

    const request: AveonlineCreateOrderRequest = {
      numeropedidoExterno: order.id,
      items: aveItems.map((i) => ({
        productRef: i.product.aveonlineProductRef!,
        quantity: i.quantity,
        price: Number(i.product.price),
        ivaValue: 0,
        weight: 1,
        name: i.product.name,
        providerId: i.product.aveonlineProviderId,
      })),
      shipping: {
        name: order.shippingName || '',
        phone: order.shippingPhone || '',
        email: order.shippingEmail || undefined,
        address: order.shippingAddress || '',
        city: order.shippingCity || '',
        state: order.shippingState || '',
        notes: order.notes || undefined,
      },
    };

    const result = await this.createOrder(request);

    for (const res of result.results) {
      await this.tracking.upsertTracking(orderId, {
        aveonlineOrderId: res.aveonlineOrderId,
        aveonlineGuideId: res.aveonlineGuideId,
        carrier: res.carrier,
        status: res.status,
        lastEvent: res.status
          ? `Pedido ${orderId} enviado a Aveonline (proveedor ${res.providerId})`
          : `Error al enviar pedido ${orderId} a Aveonline`,
        rawResponse: res.rawResponse,
      });
    }

    return result;
  }

  private async createSingleOrder(
    items: AveonlineOrderItem[],
    shipping: AveonlineShippingInfo,
    token: string,
    empresa: string,
    numeropedidoExterno: string | undefined,
    providerId: number,
  ): Promise<AveonlineOrderResult> {
    const totalWeight = items.reduce(
      (sum, item) => sum + (item.weight ?? 1) * item.quantity,
      0,
    );

    const destination = this.normalizeCity(shipping.city, shipping.state);

    const body = {
      tipo: 'authave',
      empresa,
      numeropedidoExterno,
      idproveedor: providerId,
      detalle: items.map((item) => ({
        producto: item.productRef,
        cantidad: item.quantity,
        precio: Math.round(item.price),
        iva: Math.round(item.ivaValue ?? 0),
        valorizacion: 0,
      })),
      cliente: shipping.name,
      destino: destination,
      direccion: shipping.address,
      telefono: shipping.phone,
      correo: shipping.email ?? '',
      peso: totalWeight || 1,
      observaciones: shipping.notes ?? '',
    };

    try {
      let { statusCode, data: resData } = await this.client.request(
        '/avestock/api/createOrder.php',
        'POST',
        body,
        token,
      );

      if (statusCode === 401) {
        this.logger.warn(
          'Aveonline order request: token expired, re-logging in...',
        );
        this.auth.invalidateToken();
        token = await this.auth.ensureConnected();

        const retry = await this.client.request(
          '/avestock/api/createOrder.php',
          'POST',
          body,
          token,
        );

        if (retry.statusCode === 200) {
          resData = retry.data;
          statusCode = retry.statusCode;
        }
      }

      if (statusCode === 200) {
        const parsed = this.safeParse(resData);
        return this.extractOrderResult(parsed, resData, providerId);
      }

      this.logger.warn(
        `Aveonline order failed for provider ${providerId}: ${statusCode} ${this.truncate(resData)}`,
      );

      return {
        aveonlineOrderId: null,
        aveonlineGuideId: null,
        carrier: null,
        status: `HTTP ${statusCode}`,
        providerId,
        rawResponse: this.safeParse(resData) ?? resData,
      };
    } catch (err: any) {
      this.logger.error(
        `Aveonline order error for provider ${providerId}: ${err.message}`,
      );
      return {
        aveonlineOrderId: null,
        aveonlineGuideId: null,
        carrier: null,
        status: 'error',
        providerId,
        rawResponse: { error: err.message },
      };
    }
  }

  private extractOrderResult(
    parsed: any,
    raw: string,
    providerId: number,
  ): AveonlineOrderResult {
    const orderId = this.findField(parsed, [
      'id',
      'pedido_id',
      'orderId',
      'order_id',
      'numeropedido',
      'numeropedidoExterno',
    ]);

    const guideId = this.findField(parsed, [
      'guia',
      'numero_guia',
      'nro_guia',
      'guiaId',
      'tracking_number',
      'trackingNumber',
    ]);

    const carrier = this.findField(parsed, [
      'transportadora',
      'carrier',
      'operador',
    ]);

    const status = this.findField(parsed, [
      'status',
      'estado',
      'message',
      'mensaje',
    ]);

    const isOk =
      parsed?.status === 'ok' ||
      parsed?.success === true ||
      parsed?.isSuccess === true;

    return {
      aveonlineOrderId: orderId || (isOk ? `pending-${Date.now()}` : null),
      aveonlineGuideId: guideId || null,
      carrier: carrier || null,
      status: status || (isOk ? 'CREATED' : 'UNKNOWN'),
      providerId,
      rawResponse: parsed ?? raw,
    };
  }

  private groupByProvider(
    items: AveonlineOrderItem[],
  ): Map<string, AveonlineOrderItem[]> {
    const map = new Map<string, AveonlineOrderItem[]>();
    for (const item of items) {
      const key = String(item.providerId ?? 'default');
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }

  normalizeCity(city: string | null, state: string | null): string {
    const c = this.stripAccents((city ?? '').trim()).toUpperCase();
    const s = this.stripAccents((state ?? '').trim()).toUpperCase();

    if (!c) return '';
    if (!s) return c;
    if (c.includes('(') || s.includes(')')) return `${c} ${s}`.trim();
    return `${c}(${s})`;
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
