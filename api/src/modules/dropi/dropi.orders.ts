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
  isDropiSuccess,
} from './dropi.types';
import {
  asRecord,
  matchGeoName,
  parseCarrierQualityOverrides,
  selectBestCarrierQuote,
  toNumber as toDropiNumber,
} from './carrier-selection';
import type { ScoredDropiCarrierQuote } from './carrier-selection';

interface DropiBffOrderData {
  orderId?: string | { id: number | string } | null;
  id?: number | string;
  objects?: unknown[];
}

interface DropiBffOrderResponse {
  is_succesfull?: boolean;
  is_successful?: boolean;
  isSuccess?: boolean;
  status_code?: number;
  status_reason?: string;
  reason?: string;
  /** Algunos endpoints devuelven los objetos en la raiz. */
  objects?: unknown[];
  data?: DropiBffOrderData | null;
}

/**
 * Cuerpo que Dropi (o el BFF) devuelve al cancelar una orden. Los nombres de
 * los campos no son estables entre endpoints asi que se miran varios.
 */
interface DropiCancelBody {
  isSuccess?: boolean;
  message?: string;
  status_reason?: string;
  error?: string;
  raw?: string;
}

interface DropiOrderItemInput {
  dropiProductId: number;
  quantity: number;
  price: number;
  name: string;
  supplierId?: number;
  warehouseId?: number;
  /** Bodegas candidatas, en orden de preferencia. La ultima es el respaldo. */
  warehouseIds?: number[];
  variationId?: number | null;
  suggestedPrice?: number;
  /** Peso unitario del producto, resuelto desde el catalogo de Dropi. */
  weight?: number;
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
  docType?: string;
  docNumber?: string;
  distributionCompanyId?: number;
  distributionCompanyName?: string;
  typeService?: string;
  rateType?: 'CON RECAUDO' | 'SIN RECAUDO';
  shippingAmount?: number;
  insurance?: boolean;
}

interface DropiGeoOption extends Record<string, unknown> {
  id: number;
  name: string;
}

interface DropiOriginContext {
  city: Record<string, unknown>;
  warehouse?: Record<string, unknown>;
  warehouseId?: number;
}

type DropiSelectedCarrier = ScoredDropiCarrierQuote & {
  warehouseId?: number;
};

@Injectable()
export class DropiOrdersService {
  private readonly logger = new Logger(DropiOrdersService.name);

  private static readonly GEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  private departmentsCache: {
    at: number;
    items: DropiGeoOption[];
  } | null = null;

  private citiesCache = new Map<
    string,
    { at: number; items: DropiGeoOption[] }
  >();

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
    const isOk = resData.statusCode === 200 && isDropiSuccess(parsed);

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
    if (
      resData.statusCode !== 200 ||
      !isDropiSuccess(parsed, resData.statusCode)
    ) {
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
      quotes: this.extractList(parsed),
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
      // Si al menos un producto fue rechazado de forma definitiva, el pedido no
      // se va a poder enviar completo aunque otro sí se haya creado.
      rechazo: !allOk && results.some((r) => r.rechazo === true),
    };
  }

  /**
   * ¿Dropi respondió "no" de verdad (4xx con `status_reason`) o simplemente no
   * se pudo hablar con él (5xx, timeout, excepción)?
   *
   * Un 4xx es un rechazo de negocio: repetir la llamada no cambia nada, así que
   * el pedido se cancela. Cualquier otra cosa es un fallo técnico y el pedido se
   * queda PENDING para que el admin pueda reprocesarlo.
   */
  private esRechazoDeDropi(
    statusCode: number | undefined,
    parsed: unknown,
  ): boolean {
    const codigo = Number(
      (parsed as { status_code?: number } | null)?.status_code ?? statusCode,
    );
    return Number.isFinite(codigo) && codigo >= 400 && codigo < 500;
  }

  private async createSingleOrder(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
    token: string,
  ): Promise<DropiOrderResult> {
    let enriched: DropiOrderItemInput;
    try {
      enriched = await this.enrichItemContext(item);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(
        `Dropi: falló resolver contexto de ${item.name} (${item.dropiProductId}): ${message}`,
      );
      return {
        dropiOrderId: null,
        dropiGuideId: null,
        carrier: null,
        status: `Error al resolver producto en Dropi (${item.name}): ${message}`,
        rawResponse: null,
        // Fallo técnico hablando con Dropi, no un "no": se puede reintentar.
        rechazo: false,
      };
    }

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
        // Regla de negocio nuestra: mientras no subas el precio, jamás va a
        // pasar, así que es un "no" definitivo.
        rechazo: true,
      };
    }

    // Se cotiza antes de crear la orden. Si Dropi no responde o no hay
    // ciudades/transportadoras, se sigue con el carrier fijo de .env para no
    // perder la venta. La cotizacion tambien puede revelar la bodega exacta
    // que Dropi usaria para despachar, y esa se intenta primero.
    const selectedCarrier = await this.selectCarrierForItem(enriched, shipping);
    const preferredWarehouseId = selectedCarrier?.warehouseId;
    const enrichedWithCarrier = preferredWarehouseId
      ? { ...enriched, warehouseId: preferredWarehouseId }
      : enriched;

    // El catalogo de Dropi no dice que bodegas son pedibles (no expone
    // `sucursal_id`), asi que no se puede elegir bien de una: se prueban en
    // orden y si Dropi culpa a la bodega se pasa a la siguiente.
    const candidates = this.warehouseCandidates(enrichedWithCarrier);
    const attempts: Array<number | undefined> =
      candidates.length > 0 ? candidates : [enrichedWithCarrier.warehouseId];

    let lastResult: DropiOrderResult | null = null;

    for (let i = 0; i < attempts.length; i++) {
      const warehouseId = attempts[i];
      // La cotizacion corresponde a la bodega que Dropi mismo eligio. Si hay
      // que reintentar con otra bodega, se vuelve al carrier fijo: usar el
      // carrier cotizado para otra bodega podria ser invalido.
      const effectiveShipping =
        i === 0 && selectedCarrier
          ? this.applySelectedCarrier(shipping, selectedCarrier)
          : shipping;
      const body = this.buildFinalOrder(
        { ...enriched, warehouseId },
        effectiveShipping,
      );

      if (!body) {
        return {
          dropiOrderId: null,
          dropiGuideId: null,
          carrier: null,
          status: `Falta configuración de Dropi (${this.lastMissingFields.join(', ')})`,
          rawResponse: null,
          // Es de nosotros, no de Dropi: se arregla en .env y se reprocesa.
          rechazo: false,
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

        if (resData.statusCode === 200 && isDropiSuccess(parsed)) {
          const orderId = this.extractOrderId(parsed);
          if (i > 0) {
            this.logger.warn(
              `Dropi: ${item.name} se creo con la bodega ${warehouseId} tras ${i} rechazo(s) de bodega anterior(es)`,
            );
          }
          return {
            dropiOrderId: orderId,
            dropiGuideId: null,
            carrier: effectiveShipping.distributionCompanyName || 'Dropi',
            status: parsed?.status_reason || 'CREATED',
            rawResponse: parsed ?? resData.data,
          };
        }

        const reason = parsed?.status_reason || `HTTP ${resData.statusCode}`;
        lastResult = {
          dropiOrderId: null,
          dropiGuideId: null,
          carrier: null,
          status: reason,
          rawResponse: parsed ?? resData.data,
          rechazo: this.esRechazoDeDropi(resData.statusCode, parsed),
        };

        if (i === attempts.length - 1 || !this.isRetryableRejection(reason)) {
          this.logger.warn(
            `Dropi order failed for ${item.name}: ${resData.statusCode} ${resData.data.slice(0, 300)}`,
          );
          return lastResult;
        }

        this.logger.warn(
          `Dropi: bodega ${warehouseId} rechazada para ${item.name} ("${reason}"); se prueba la siguiente`,
        );
      } catch (err: unknown) {
        // Fallo de red o de token: nada que ver con la bodega, no se reintenta.
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
          // Nunca un rechazo: Dropi ni siquiera respondió.
          rechazo: false,
        };
      }
    }

    return (
      lastResult ?? {
        dropiOrderId: null,
        dropiGuideId: null,
        carrier: null,
        status: `Dropi no devolvio respuesta para ${item.name}`,
        rawResponse: null,
        rechazo: false,
      }
    );
  }

  /**
   * Cotiza el envio y elige la transportadora con mejor relacion precio/calidad.
   *
   * Nunca lanza: cualquier fallo de red, de ciudades o de cotizacion devuelve
   * null y el checkout sigue con la transportadora configurada en .env. El
   * pedido no se pierde por un problema del cotizador.
   */
  private async selectCarrierForItem(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
  ): Promise<DropiSelectedCarrier | null> {
    if (!this.carrierAutoSelectEnabled()) return null;
    if (
      !item.dropiProductId ||
      !shipping.city?.trim() ||
      !shipping.state?.trim() ||
      !shipping.address?.trim() ||
      !shipping.phone?.trim()
    ) {
      return null;
    }

    const selection = this.resolveAndSelectCarrier(item, shipping).catch(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Dropi cotizacion: no se pudo elegir transportadora para ${item.name}: ${message}`,
        );
        return null;
      },
    );

    const selected = await this.withTimeout(selection, this.carrierTimeoutMs());
    if (!selected) {
      this.logger.log(
        `Dropi cotizacion: sin seleccion automatica para ${item.name}; se usa la transportadora configurada`,
      );
      return null;
    }

    this.logger.log(
      `Dropi cotizacion: ${item.name} -> ${selected.carrierName} (${selected.service}) ` +
        `$${selected.price}, calidad ${selected.quality.toFixed(2)}, ` +
        `costo ajustado ${selected.adjustedCost.toFixed(0)}`,
    );
    return selected;
  }

  private async resolveAndSelectCarrier(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
  ): Promise<DropiSelectedCarrier | null> {
    const origin = await this.resolveOriginCity(item, shipping);
    if (!origin) return null;

    const rateType = shipping.rateType ?? this.rateType();
    const destination = await this.resolveDestinationCity(
      shipping.state,
      shipping.city,
      rateType,
    );
    if (!destination) return null;

    // En el frontend de Dropi conviven dos formatos: el flujo principal manda
    // `peso/largo/ancho/alto` en minuscula y el cotizador anterior los manda
    // en mayuscula. Se intenta primero el formato principal y, si no hay
    // cotizacion, se reintenta con el otro para no perder la seleccion.
    let quote: DropiQuoteResult | null = null;
    try {
      quote = await this.quoteShipping(
        this.buildQuoteParams(item, shipping, origin, destination, 'lower'),
      );
    } catch {
      // Se reintenta abajo con el formato alterno.
    }

    if (!quote?.success || quote.quotes.length === 0) {
      try {
        const upperQuote = await this.quoteShipping(
          this.buildQuoteParams(item, shipping, origin, destination, 'upper'),
        );
        if (upperQuote.success && upperQuote.quotes.length > 0) {
          quote = upperQuote;
        } else if (!quote) {
          quote = upperQuote;
        }
      } catch {
        // Se conserva el resultado anterior (o null) para caer al carrier fijo.
      }
    }

    if (!quote?.success || quote.quotes.length === 0) {
      this.logger.warn(
        `Dropi cotizacion sin opciones para ${shipping.city}, ${shipping.state}: ` +
          `${quote?.message || 'sin transportadoras'}`,
      );
      return null;
    }

    const qualityWeight = this.carrierQualityWeight();
    const best = selectBestCarrierQuote(quote.quotes, {
      qualityWeight,
      priceWeight: qualityWeight === undefined ? undefined : 1 - qualityWeight,
      qualityOverrides: parseCarrierQualityOverrides(
        process.env.DROPI_CARRIER_QUALITY_OVERRIDES,
      ),
    });
    if (!best) {
      this.logger.warn(
        `Dropi cotizacion: ${quote.quotes.length} opciones para ${shipping.city} pero ninguna utilizable`,
      );
      return null;
    }

    return {
      ...best,
      warehouseId: origin.warehouseId ?? item.warehouseId,
    };
  }

  private async resolveOriginCity(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
  ): Promise<DropiOriginContext | null> {
    const type =
      item.variationId && item.variationId > 0 ? 'VARIABLE' : 'SIMPLE';
    const referenceId =
      type === 'VARIABLE' && item.variationId
        ? item.variationId
        : item.dropiProductId;

    const body = {
      id: referenceId,
      destination: `${shipping.city}, ${shipping.state}`.toLowerCase(),
      type,
      is_edit_order: false,
    };

    const res = await this.requestWithReauth(
      '/api/orders/getOriginCityForCalculateShipping',
      'POST',
      body,
      DROPI_API_HOST,
    );
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      this.logger.warn(`Dropi origen: HTTP ${status} para ${item.name}`);
      return null;
    }

    const parsed = this.parseAny(res.data);
    const object = this.extractObject(parsed);
    const city =
      asRecord(object?.city_dropi) ??
      asRecord(object?.city) ??
      asRecord(object?.ciudad);
    const warehouse = asRecord(object?.warehouse);
    const warehouseId =
      toDropiNumber(warehouse?.id) ?? toDropiNumber(item.warehouseId);

    if (!city) {
      this.logger.warn(
        `Dropi origen: respuesta sin ciudad para ${item.name} ` +
          `(${shipping.city}, ${shipping.state})`,
      );
      return null;
    }

    return {
      city,
      warehouse: warehouse ?? undefined,
      warehouseId: warehouseId ?? undefined,
    };
  }

  private async resolveDestinationCity(
    state: string,
    city: string,
    rateType: string,
  ): Promise<DropiGeoOption | null> {
    const departments = await this.getDepartments();
    if (departments.length === 0) return null;

    const department = matchGeoName(departments, state);
    if (!department) {
      this.logger.warn(
        `Dropi destino: no se encontro el departamento "${state}"`,
      );
      return null;
    }

    const cities = await this.getCities(department.id, rateType);
    if (cities.length === 0) return null;

    const match = matchGeoName(cities, city);
    if (!match) {
      this.logger.warn(
        `Dropi destino: no se encontro la ciudad "${city}" en ${department.name}`,
      );
      return null;
    }
    return match;
  }

  private async getDepartments(): Promise<DropiGeoOption[]> {
    const now = Date.now();
    if (
      this.departmentsCache &&
      now - this.departmentsCache.at < DropiOrdersService.GEO_CACHE_TTL_MS
    ) {
      return this.departmentsCache.items;
    }

    const res = await this.requestWithReauth(
      '/api/department?country_id=1',
      'GET',
      undefined,
      DROPI_API_HOST,
    );
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      this.logger.warn(`Dropi destino: /department respondio HTTP ${status}`);
      return [];
    }

    const items = this.geoOptions(this.extractList(this.parseAny(res.data)));
    if (items.length > 0) {
      this.departmentsCache = { at: now, items };
    }
    return items;
  }

  private async getCities(
    departmentId: number,
    rateType: string,
  ): Promise<DropiGeoOption[]> {
    const key = `${departmentId}|${rateType}`;
    const now = Date.now();
    const cached = this.citiesCache.get(key);
    if (cached && now - cached.at < DropiOrdersService.GEO_CACHE_TTL_MS) {
      return cached.items;
    }

    const res = await this.requestWithReauth(
      '/api/trajectory/bycity',
      'POST',
      { rate_type: rateType, department_id: departmentId },
      DROPI_API_HOST,
    );
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      this.logger.warn(
        `Dropi destino: /trajectory/bycity respondio HTTP ${status}`,
      );
      return [];
    }

    const items = this.geoOptions(this.extractList(this.parseAny(res.data)));
    if (items.length > 0) {
      this.citiesCache.set(key, { at: now, items });
    }
    return items;
  }

  private geoOptions(items: unknown[]): DropiGeoOption[] {
    const out: DropiGeoOption[] = [];
    for (const item of items) {
      const record = asRecord(item);
      if (!record) continue;

      const id = toDropiNumber(record.id);
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (id === null || id <= 0 || !name) continue;

      out.push({ ...record, id, name });
    }
    return out;
  }

  private extractList(parsed: any): unknown[] {
    if (!parsed) return [];
    const data = parsed.data;
    const candidates = [
      parsed.objects,
      data?.objects,
      parsed.cities,
      data?.cities,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;

      // Algunas respuestas envuelven la lista: { objects: { cities: [...] } }.
      const nested = asRecord(candidate);
      if (nested) {
        for (const value of Object.values(nested)) {
          if (Array.isArray(value)) return value;
        }
      }
    }
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(data)) return data;
    return [];
  }

  private extractObject(parsed: any): Record<string, any> | null {
    if (!parsed) return null;
    const data = parsed.data;
    const candidates = [data?.objects, parsed.objects, data];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        const first = asRecord(candidate[0]);
        if (first) return first;
      }
      const record = asRecord(candidate);
      if (record) return record;
    }
    return asRecord(parsed);
  }

  private parseAny(data: string): any {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async requestWithReauth(
    path: string,
    method: string,
    body: object | undefined,
    host: string,
  ): Promise<DropiHttpResponse> {
    let token = await this.auth.getToken();
    let res = await this.client.request(path, method, body, token, host);

    if (res.statusCode === 401) {
      this.logger.warn('Dropi cotizacion: token expired, re-logging in...');
      this.auth.invalidateToken();
      token = await this.auth.getToken();
      res = await this.client.request(path, method, body, token, host);
    }
    return res;
  }

  private carrierAutoSelectEnabled(): boolean {
    const value = process.env.DROPI_CARRIER_AUTO_SELECT?.trim();
    if (!value) return true;
    return !/^(0|false|no|off)$/i.test(value);
  }

  private carrierTimeoutMs(): number {
    const value = Number(process.env.DROPI_CARRIER_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : 10000;
  }

  private carrierQualityWeight(): number | undefined {
    const raw = process.env.DROPI_CARRIER_QUALITY_WEIGHT;
    if (raw === undefined || raw.trim() === '') return undefined;

    const value = Number(raw);
    if (!Number.isFinite(value)) return undefined;
    return Math.min(0.95, Math.max(0.05, value));
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race<T | null>([
        promise,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private applySelectedCarrier(
    shipping: DropiOrderShippingInput,
    selected: DropiSelectedCarrier,
  ): DropiOrderShippingInput {
    return {
      ...shipping,
      distributionCompanyId: selected.carrierId,
      distributionCompanyName: selected.carrierName,
      typeService: selected.service,
      shippingAmount: selected.price,
    };
  }

  private buildQuoteParams(
    item: DropiOrderItemInput,
    shipping: DropiOrderShippingInput,
    origin: DropiOriginContext,
    destination: DropiGeoOption,
    fieldCase: 'lower' | 'upper',
  ): DropiQuoteParams {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const weight = Math.max(0.1, Number(item.weight) || 1) * quantity;
    const rateType = shipping.rateType ?? this.rateType();
    const warehouse =
      origin.warehouse ??
      (origin.warehouseId ? { id: origin.warehouseId } : undefined);
    const dimensions =
      fieldCase === 'upper'
        ? { Peso: weight, Largo: 1, Ancho: 1, Alto: 1 }
        : { peso: weight, largo: 1, ancho: 1, alto: 1 };

    return {
      ...dimensions,
      ValorDeclarado: Math.max(0, Number(item.price) || 0) * quantity,
      ciudad_remitente: origin.city,
      ciudad_destino: destination,
      EnvioConCobro: rateType !== 'SIN RECAUDO',
      products: [
        {
          id: item.dropiProductId,
          variation_id: item.variationId ?? null,
          quantity,
          price: item.price,
        },
      ],
      warehouse,
      zip_code: shipping.zip ?? null,
      colonia: null,
      dir: shipping.address,
      destination_name: shipping.name,
      destination_phone: shipping.phone,
      insurance: shipping.insurance ?? false,
    };
  }

  private rateType(): 'CON RECAUDO' | 'SIN RECAUDO' {
    return (
      (process.env.DROPI_RATE_TYPE as
        'CON RECAUDO' | 'SIN RECAUDO' | undefined) ?? 'CON RECAUDO'
    );
  }

  private warehouseCandidates(item: DropiOrderItemInput): number[] {
    const out: number[] = [];
    const push = (value: unknown) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    };

    // La bodega del proveedor va primero: es la que Dropi confirmo en las ordenes
    // que si se crearon (`order.warehouse.user_id` = el del proveedor). La de
    // .env va de ultima porque antes nunca se usaba y no hay evidencia de que
    // sirva, pero mejor eso que perder el pedido.
    push(item.warehouseId);
    for (const id of item.warehouseIds ?? []) push(id);
    push(process.env.DROPI_WAREHOUSE_ID);

    return out;
  }

  private isWarehouseRejection(reason: string): boolean {
    return /bodega|warehouse|sucursal|branch/i.test(reason);
  }

  /**
   * Dropi devuelve "intenta cotizar nuevamente... las existencias han variado"
   * cuando la bodega elegida no puede surtir la cantidad pedida en ese momento.
   * No crea la orden, asi que es seguro probar la siguiente bodega candidata
   * (la de mas stock va primero). Un "no tiene stock disponible" global NO entra
   * aqui: ahi ninguna bodega va a servir.
   */
  private isStockChangedRejection(reason: string): boolean {
    return /existencias han variado|cotiza[r]? nuevamente/i.test(reason);
  }

  private isRetryableRejection(reason: string): boolean {
    return (
      this.isWarehouseRejection(reason) || this.isStockChangedRejection(reason)
    );
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

  private parseCancelResponse(res: DropiHttpResponse): DropiCancelResult {
    let body: DropiCancelBody = {};
    try {
      body = JSON.parse(res.data) as DropiCancelBody;
    } catch {
      body = { raw: res.data };
    }
    const ok =
      (res.statusCode ?? 0) >= 200 &&
      (res.statusCode ?? 0) < 300 &&
      body.isSuccess !== false;
    return {
      success: ok,
      error: body.message || body.status_reason || body.error || undefined,
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
    if (item.supplierId && item.warehouseId && item.weight) return item;

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
      warehouseIds: [...(item.warehouseIds ?? []), ...(ctx.warehouseIds ?? [])],
      variationId: item.variationId ?? ctx.variationId ?? null,
      suggestedPrice: ctx.suggestedPrice,
      weight: item.weight ?? ctx.weight ?? 1,
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

    const state = this.normalizeDepartment(shipping.state || '');

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
      dni: shipping.docNumber || '',
      dni_type: shipping.docType || '',
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
      state,
      supplier_id: supplierId,
      type: 'FINAL_ORDER',
      type_service: shipping.typeService ?? 'normal',
      user_id: userId,
      warehouses_selected_id: warehouseId,
      zip_code: shipping.zip ?? null,
    };
  }

  private normalizeDepartment(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;

    const departments = [
      'AMAZONAS',
      'ANTIOQUIA',
      'ARAUCA',
      'ATLANTICO',
      'BOLIVAR',
      'BOYACA',
      'CALDAS',
      'CAQUETA',
      'CASANARE',
      'CAUCA',
      'CESAR',
      'CHOCO',
      'CORDOBA',
      'CUNDINAMARCA',
      'GUAINIA',
      'GUAVIARE',
      'HUILA',
      'LA GUAJIRA',
      'MAGDALENA',
      'META',
      'NARINO',
      'NORTE DE SANTANDER',
      'PUTUMAYO',
      'QUINDIO',
      'RISARALDA',
      'SAN ANDRES Y PROVIDENCIA',
      'SANTANDER',
      'SUCRE',
      'TOLIMA',
      'VALLE DEL CAUCA',
      'VAUPES',
      'VICHADA',
      'BOGOTA',
      'BOGOTA D.C.',
    ];

    const normalize = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[áàâä]/g, 'a')
        .replace(/[éèêë]/g, 'e')
        .replace(/[íìîï]/g, 'i')
        .replace(/[óòôö]/g, 'o')
        .replace(/[úùûü]/g, 'u')
        .replace(/[ñ]/g, 'n')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalized = normalize(trimmed);
    if (!normalized) return trimmed;

    const exact = departments.find((d) => normalize(d) === normalized);
    if (exact) return exact;

    let best: string | null = null;
    let bestScore = Infinity;
    for (const d of departments) {
      const score = this.levenshtein(normalized, normalize(d));
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }

    if (best && bestScore <= Math.max(2, Math.floor(normalized.length / 3))) {
      this.logger.log(
        `Dropi: departamento "${trimmed}" normalizado a "${best}"`,
      );
      return best;
    }

    return trimmed;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(
          dp[j] + 1,
          dp[j - 1] + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        prev = tmp;
      }
    }
    return dp[n];
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
