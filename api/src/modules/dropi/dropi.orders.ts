import { Injectable, Logger } from '@nestjs/common';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { DropiProductsService } from './dropi.products';
import {
  DropiCancelResult,
  DropiCreateOrderRequest,
  DropiCreateOrderResponse,
  DropiFinalOrderResult,
  DropiHttpResponse,
  DropiOrderResult,
  DropiQuoteParams,
  DropiQuoteResult,
  DROPI_API_HOST,
  DROPI_BFF_HOST,
} from './dropi.types';

interface DropiBffOrderData {
  orderId?: string | { id: number | string } | null;
  id?: number | string;
  objects?: unknown[];
}

interface DropiBffOrderResponse {
  is_succesfull?: boolean;
  status_code?: number;
  status_reason?: string;
  reason?: string;
  data?: DropiBffOrderData | null;
}

interface DropiOrderItemInput {
  dropiProductId: number;
  quantity: number;
  price: number;
  name: string;
  supplierId?: number;
  warehouseId?: number;
  variationId?: number | null;
  suggestedPrice?: number;
}

interface DropiOrderShippingInput {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  notes?: string;
  zip?: string;
  distributionCompanyId?: number;
  distributionCompanyName?: string;
  rateType?: 'CON RECAUDO' | 'SIN RECAUDO';
  shippingAmount?: number;
  insurance?: boolean;
}

@Injectable()
export class DropiOrdersService {
  private readonly logger = new Logger(DropiOrdersService.name);

  constructor(
    private readonly client: DropiClient,
    private readonly auth: DropiAuthService,
    private readonly products: DropiProductsService,
  ) {}

  async createFinalOrder(
    payload: Record<string, any>,
  ): Promise<DropiFinalOrderResult> {
    let token = await this.auth.getToken();
    let resData = await this.postOrder(payload, token);

    if (resData.statusCode === 401) {
      this.logger.warn('Dropi order: token expired, re-logging in...');
      this.auth.invalidateToken();
      token = await this.auth.getToken();
      resData = await this.postOrder(payload, token);
    }

    const parsed = this.safeParse(resData.data);
    const isOk = resData.statusCode === 200 && parsed?.is_succesfull === true;

    if (!isOk) {
      this.logger.warn(
        `Dropi createOrder failed: ${resData.statusCode} ${resData.data.slice(0, 300)}`,
      );
      return {
        success: false,
        orderId: null,
        message:
          parsed?.status_reason ||
          parsed?.reason ||
          `HTTP ${resData.statusCode}`,
        rawResponse: parsed ?? resData.data,
      };
    }

    const orderId = this.extractOrderId(parsed);
    this.logger.log(`Dropi order created: ${orderId || 'sin id'}`);

    return {
      success: true,
      orderId,
      message: parsed?.status_reason || 'CREATED',
      rawResponse: parsed ?? resData.data,
    };
  }

  async quoteShipping(params: DropiQuoteParams): Promise<DropiQuoteResult> {
    let token = await this.auth.getToken();
    let resData = await this.postQuote(params, token);

    if (resData.statusCode === 401) {
      this.auth.invalidateToken();
      token = await this.auth.getToken();
      resData = await this.postQuote(params, token);
    }

    const parsed = this.safeParse(resData.data);
    if (resData.statusCode !== 200 || parsed?.is_succesfull !== true) {
      return {
        success: false,
        quotes: [],
        message:
          parsed?.status_reason ||
          parsed?.reason ||
          `HTTP ${resData.statusCode}`,
        rawResponse: parsed ?? resData.data,
      };
    }

    return {
      success: true,
      quotes: Array.isArray(parsed?.data?.objects) ? parsed.data.objects : [],
      message: parsed?.status_reason,
      rawResponse: parsed,
    };
  }

  async createOrder(
    data: DropiCreateOrderRequest,
  ): Promise<DropiCreateOrderResponse> {
    const token = await this.auth.getToken();
    const results: DropiOrderResult[] = [];

    for (const item of data.items) {
      const result = await this.createSingleOrder(item, data.shipping, token);
      results.push(result);
    }

    const allOk = results.every((r) => r.dropiOrderId);

    return {
      success: allOk,
      message: results
        .map((r) =>
          r.dropiOrderId
            ? `Dropi OK: ${r.dropiOrderId}`
            : `Dropi falló: ${r.status || 'sin respuesta'}`,
        )
        .join(' | '),
      results,
    };
  }

  private async createSingleOrder(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
    token: string,
  ): Promise<DropiOrderResult> {
    const enriched = await this.enrichItemContext(item);

    const minPrice =
      enriched.suggestedPrice && enriched.suggestedPrice > 0
        ? Math.ceil(enriched.suggestedPrice)
        : null;
    if (minPrice && (enriched.price || 0) < minPrice) {
      this.logger.warn(
        `Dropi: precio ${enriched.price} de ${enriched.dropiProductId} por debajo del sugerido (${minPrice}); orden rechazada sin llamar a Dropi`,
      );
      return {
        dropiOrderId: null,
        dropiGuideId: null,
        carrier: null,
        status: `El precio de venta del producto debe ser al menos el sugerido de Dropi (${minPrice}) para que la orden se cree`,
        rawResponse: null,
      };
    }

    const body = this.buildFinalOrder(enriched, shipping);

    if (!body) {
      return {
        dropiOrderId: null,
        dropiGuideId: null,
        carrier: null,
        status: `Falta configuración de Dropi (${this.lastMissingFields.join(', ')})`,
        rawResponse: null,
      };
    }

    try {
      let resData = await this.postOrder(body, token);

      if (resData.statusCode === 401) {
        this.logger.warn(
          'Dropi order request: token expired, re-logging in...',
        );
        this.auth.invalidateToken();
        token = await this.auth.getToken();
        resData = await this.postOrder(body, token);
      }

      const parsed = this.safeParse(resData.data);

      if (resData.statusCode === 200 && parsed?.is_succesfull === true) {
        const orderId = this.extractOrderId(parsed);
        return {
          dropiOrderId: orderId,
          dropiGuideId: null,
          carrier: shipping.distributionCompanyName || 'Dropi',
          status: parsed?.status_reason || 'CREATED',
          rawResponse: parsed ?? resData.data,
        };
      }

      this.logger.warn(
        `Dropi order failed for ${item.name}: ${resData.statusCode} ${resData.data.slice(0, 300)}`,
      );

      return {
        dropiOrderId: null,
        dropiGuideId: null,
        carrier: null,
        status: parsed?.status_reason || `HTTP ${resData.statusCode}`,
        rawResponse: parsed ?? resData.data,
      };
    } catch (err: unknown) {
      let message = 'unknown error';
      if (err instanceof Error) message = err.message;
      else if (typeof err === 'string') message = err;
      this.logger.error(`Dropi order error for ${item.name}: ${message}`);
      return {
        dropiOrderId: null,
        dropiGuideId: null,
        carrier: null,
        status: 'error',
        rawResponse: { error: message },
      };
    }
  }

  async cancelOrder(dropiOrderId: number): Promise<DropiCancelResult> {
    let token = await this.auth.getToken();
    let res = await this.client.request(
      `/api/orders/myorders/${dropiOrderId}`,
      'PUT',
      { status: 'CANCELADO', order_id: dropiOrderId },
      token,
      DROPI_API_HOST,
    );

    if (res.statusCode === 401) {
      this.logger.warn('Dropi cancel: token expired, re-logging in...');
      this.auth.invalidateToken();
      token = await this.auth.getToken();
      res = await this.client.request(
        `/api/orders/myorders/${dropiOrderId}`,
        'PUT',
        { status: 'CANCELADO', order_id: dropiOrderId },
        token,
        DROPI_API_HOST,
      );
    }

    const parsed = this.parseCancelResponse(res);
    this.logger.log(
      `Dropi cancel #${dropiOrderId}: ${parsed.success ? 'OK' : 'rechazado'} (${res.statusCode}) ${parsed.error || ''}`,
    );
    return parsed;
  }

  private parseCancelResponse(
    res: DropiHttpResponse,
  ): DropiCancelResult {
    let body: any = {};
    try {
      body = JSON.parse(res.data);
    } catch {
      body = { raw: res.data };
    }
    const ok =
      (res.statusCode ?? 0) >= 200 &&
      (res.statusCode ?? 0) < 300 &&
      body.isSuccess !== false;
    return {
      success: ok,
      error:
        body.message || body.status_reason || body.error || undefined,
      rawResponse: body,
    };
  }

  private async postOrder(
    body: Record<string, any> | object,
    token: string,
  ): Promise<DropiHttpResponse> {
    return this.client.request(
      '/bff/orders',
      'POST',
      body,
      token,
      DROPI_BFF_HOST,
    );
  }

  private async postQuote(
    params: DropiQuoteParams,
    token: string,
  ): Promise<DropiHttpResponse> {
    return this.client.request(
      '/bff/orders/quote',
      'POST',
      params,
      token,
      DROPI_BFF_HOST,
    );
  }

  private lastMissingFields: string[] = [];

  private async enrichItemContext(
    item: DropiOrderItemInput,
  ): Promise<DropiOrderItemInput> {
    if (item.supplierId && item.warehouseId) return item;

    const ctx = await this.products.resolveDropshipperContext(
      item.dropiProductId,
    );

    if (!ctx) {
      this.logger.warn(
        `Dropi: no se pudo resolver proveedor/bodega para ${item.dropiProductId}, usando defaults de .env`,
      );
      return item;
    }

    const shipping = Number(process.env.DROPI_SHIPPING_AMOUNT || 0);
    if (shipping > 0 && item.price <= ctx.salePrice + shipping) {
      this.logger.warn(
        `Dropi: el precio ${item.price} de ${item.dropiProductId} no cubre costo (${ctx.salePrice}) + envío configurado (${shipping}); el servidor validará el monto a ganar`,
      );
    }

    return {
      ...item,
      supplierId: item.supplierId ?? ctx.supplierId,
      warehouseId: item.warehouseId ?? ctx.warehouseId,
      suggestedPrice: ctx.suggestedPrice,
    };
  }

  private buildFinalOrder(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
  ): Record<string, any> | null {
    const num = (v?: string | number | null): number | undefined =>
      v === undefined || v === null || v === '' ? undefined : Number(v);

    const userId = num(process.env.DROPI_USER_ID);
    const supplierId = num(item.supplierId ?? process.env.DROPI_SUPPLIER_ID);
    const warehouseId = num(item.warehouseId ?? process.env.DROPI_WAREHOUSE_ID);
    const distributionCompanyId = num(
      shipping.distributionCompanyId ??
        process.env.DROPI_DISTRIBUTION_COMPANY_ID,
    );
    const distributionCompanyName =
      shipping.distributionCompanyName ??
      process.env.DROPI_DISTRIBUTION_COMPANY_NAME ??
      'Dropi';
    const shippingAmount = num(
      shipping.shippingAmount ?? process.env.DROPI_SHIPPING_AMOUNT,
    );
    const rateType =
      shipping.rateType ??
      (process.env.DROPI_RATE_TYPE as 'CON RECAUDO' | 'SIN RECAUDO') ??
      'CON RECAUDO';

    const missing: string[] = [];
    if (!userId) missing.push('user_id');
    if (!supplierId) missing.push('supplier_id');
    if (!warehouseId) missing.push('warehouses_selected_id');
    if (!distributionCompanyId) missing.push('distributionCompany');
    if (shippingAmount === undefined) missing.push('shipping_amount');
    if (!shipping.phone) missing.push('phone');
    if (!shipping.address) missing.push('dir');
    if (!shipping.city) missing.push('city');
    if (!shipping.state) missing.push('state');

    if (missing.length > 0) {
      this.lastMissingFields = missing;
      this.logger.warn(
        `Dropi FINAL_ORDER incompleto, faltan: ${missing.join(', ')}`,
      );
      return null;
    }
    this.lastMissingFields = [];

    const nameParts = (shipping.name || '').trim().split(/\s+/);
    const name = nameParts.shift() || 'Cliente';
    const surname = nameParts.join(' ') || '';

    return {
      total_order: item.price * item.quantity,
      notes: shipping.notes ?? '',
      name,
      surname,
      dir: shipping.address,
      city: shipping.city,
      client_email: shipping.email || process.env.DROPI_EMAIL || '',
      colonia: '',
      country: 'COLOMBIA',
      distributionCompany: {
        id: distributionCompanyId,
        name: distributionCompanyName,
      },
      dni: '',
      dni_type: '',
      insurance: shipping.insurance ?? false,
      payment_method_id: 1,
      phone: shipping.phone,
      products: [
        {
          id: item.dropiProductId,
          variation_id: item.variationId ?? null,
          quantity: item.quantity,
          price: item.price,
        },
      ],
      rate_type: rateType,
      shalom_data: null,
      shipping_amount: shippingAmount,
      shop_id: null,
      state: shipping.state,
      supplier_id: supplierId,
      type: 'FINAL_ORDER',
      type_service: 'normal',
      user_id: userId,
      warehouses_selected_id: warehouseId,
      zip_code: shipping.zip ?? null,
    };
  }

  private extractOrderId(parsed: DropiBffOrderResponse | null): string | null {
    if (!parsed || !parsed.data) return null;

    const data = parsed.data;
    const orderId = data.orderId;
    if (typeof orderId === 'object' && orderId !== null) {
      return orderId.id != null ? String(orderId.id) : null;
    }
    if (orderId !== undefined && orderId !== null && orderId !== '') {
      return String(orderId);
    }
    if (data.id !== undefined && data.id !== null && data.id !== '') {
      return String(data.id);
    }
    return null;
  }

  private safeParse(data: string): DropiBffOrderResponse | null {
    try {
      return JSON.parse(data) as DropiBffOrderResponse;
    } catch {
      return null;
    }
  }
}
