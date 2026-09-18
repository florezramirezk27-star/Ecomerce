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
}

export interface DropiCreateOrderResponse {
  success: boolean;
  message: string;
  results: DropiOrderResult[];
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
  rawResponse: any;
}

export const DROPI_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  CREATED: 'PENDING',
  CONFIRMED: 'PAID',
  ACCEPTED: 'PAID',
  APPROVED: 'PAID',
  PROCESSING: 'PAID',
  IN_PREPARATION: 'PAID',
  IN_TRANSIT: 'SHIPPED',
  SHIPPED: 'SHIPPED',
  SENT: 'SHIPPED',
  IN_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'CANCELLED',
  RETURNED: 'CANCELLED',
  REFUNDED: 'CANCELLED',
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
