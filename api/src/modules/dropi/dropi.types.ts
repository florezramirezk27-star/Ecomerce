export interface DropiHttpResponse {
  statusCode?: number;
  data: string;
}

export interface DropiCatalogBody {
  pageSize?: number;
  startData?: number;
  privated_product?: boolean;
  userVerified?: boolean;
  favorite?: boolean;
  country?: string;
  get_stock?: boolean;
  no_count?: boolean;
  search_type?: string;
  keywords?: string;
  name?: string;
  with_collection?: boolean;
}

export interface DropiCatalogResponse {
  isSuccess: boolean;
  message?: string;
  objects?: any[];
}

export interface DropiOrderItem {
  dropiProductId: number;
  quantity: number;
  price: number;
  name: string;
  supplierId?: number;
  warehouseId?: number;
  variationId?: number | null;
}

export interface DropiShippingInfo {
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
  rateType?: 'CON RECAUDO' | 'SIN RECAUDO';
  shippingAmount?: number;
  insurance?: boolean;
}

export interface DropiCreateOrderRequest {
  items: DropiOrderItem[];
  shipping: DropiShippingInfo;
}

export interface DropiOrderResult {
  dropiOrderId: string | null;
  dropiGuideId: string | null;
  carrier: string | null;
  status: string | null;
  rawResponse: any;
  /**
   * true cuando fue un "no" de Dropi (respondio 4xx, el precio esta por debajo
   * del sugerido, etc.): reintentar no va a cambiar nada. false cuando fue un
   * fallo tecnico (red, 5xx, excepcion) y el pedido conviene dejarlo en
   * PENDING para reprocesarlo desde el panel.
   */
  rechazo?: boolean;
}

export interface DropiCreateOrderResponse {
  success: boolean;
  message: string;
  results: DropiOrderResult[];
  /** true si al menos un producto fue rechazado de forma definitiva. */
  rechazo?: boolean;
}

export interface DropiStockItem {
  dropiProductId: number;
  quantity: number;
  name: string;
}

export interface DropiStockResult {
  name: string;
  requested: number;
  available: number;
}

export interface DropiStockValidation {
  ok: boolean;
  insufficient: DropiStockResult[];
}

export interface DropiTrackingData {
  status: string | null;
  lastEvent: string | null;
  carrier: string | null;
  /** Guía de envío, si Dropi ya la tiene; se guarda para las próximas consultas. */
  guide?: string | null;
  rawResponse: any;
}

/**
 * Estados de Dropi -> estados internos del pedido.
 *
 * Dropi responde en español y en mayúsculas (`"status":"CANCELADO"`,
 * historial `PENDIENTE` -> `CANCELADO`), pero el mapa también cubre los nombres
 * en inglés que usaba la documentación vieja. Cualquier clave se consulta ya
 * normalizada (sin acentos, mayúsculas y espacios a `_`, ver
 * `DropiTrackingService.translateStatus`), así que "En tránsito" o "en proceso"
 * también caen acá. Lo que no esté aquí queda PENDING y no mueve nada.
 */
export const DROPI_STATUS_MAP: Record<string, string> = {
  // Recién creado / nadie lo ha confirmado todavía.
  PENDING: 'PENDING',
  PENDIENTE: 'PENDING',
  CREATED: 'PENDING',
  CREADO: 'PENDING',
  NUEVO: 'PENDING',
  NEW: 'PENDING',

  // Dropi o el proveedor lo aceptó y ya está en preparación.
  CONFIRMED: 'PAID',
  CONFIRMADO: 'PAID',
  CONFIRMADA: 'PAID',
  ACCEPTED: 'PAID',
  ACEPTADO: 'PAID',
  ACEPTADA: 'PAID',
  APPROVED: 'PAID',
  APROBADO: 'PAID',
  APROBADA: 'PAID',
  PROCESSING: 'PAID',
  EN_PROCESO: 'PAID',
  IN_PREPARATION: 'PAID',
  EN_PREPARACION: 'PAID',
  PREPARANDO: 'PAID',

  // En camino hacia el cliente.
  IN_TRANSIT: 'SHIPPED',
  SHIPPED: 'SHIPPED',
  SENT: 'SHIPPED',
  ENVIADO: 'SHIPPED',
  ENVIADA: 'SHIPPED',
  EN_TRANSITO: 'SHIPPED',
  DESPACHADO: 'SHIPPED',
  DESPACHADA: 'SHIPPED',
  EN_REPARTO: 'SHIPPED',
  IN_DELIVERY: 'SHIPPED',

  // Entregado.
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  ENTREGADO: 'DELIVERED',
  ENTREGADA: 'DELIVERED',
  COMPLETADO: 'DELIVERED',
  FINALIZADO: 'DELIVERED',

  // Cancelado / rechazado / borrado en Dropi.
  CANCELLED: 'CANCELLED',
  CANCELADO: 'CANCELLED',
  CANCELADA: 'CANCELLED',
  CANCELED: 'CANCELLED',
  CANCELLATION: 'CANCELLED',
  ELIMINADO: 'CANCELLED',
  ELIMINADA: 'CANCELLED',
  DELETED: 'CANCELLED',
  REMOVED: 'CANCELLED',
  ANULADO: 'CANCELLED',
  ANULADA: 'CANCELLED',
  REJECTED: 'CANCELLED',
  RECHAZADO: 'CANCELLED',
  RECHAZADA: 'CANCELLED',
  RETURNED: 'CANCELLED',
  REFUNDED: 'CANCELLED',
  DEVUELTO: 'CANCELLED',
  DEVUELTA: 'CANCELLED',
};

export const DROPI_CDN =
  process.env.DROPI_CDN || 'https://d39ru7awumhhs2.cloudfront.net/';

export const DROPI_API_HOST = 'api.dropi.co';

export const DROPI_BFF_HOST = 'api-v2.dropi.co';

export interface DropiFinalOrderResult {
  success: boolean;
  orderId: string | null;
  message: string;
  rawResponse: any;
}

export interface DropiCancelResult {
  success: boolean;
  error?: string;
  rawResponse: any;
}

export interface DropiQuoteParams {
  peso?: number;
  largo?: number;
  ancho?: number;
  alto?: number;
  ciudad_remitente?: any;
  ciudad_destino?: any;
  cod_dane?: string;
  EnvioConCobro?: boolean;
  products: Array<{
    id: number;
    variation_id?: number | null;
    quantity: number;
    price: number;
  }>;
  ValorDeclarado?: number;
  warehouse?: any;
  zip_code?: string | null;
  colonia?: string | null;
  dir?: string | null;
  destination_name?: string | null;
  destination_phone?: string | null;
}

export interface DropiQuoteResult {
  success: boolean;
  quotes: any[];
  message?: string;
  rawResponse: any;
}
