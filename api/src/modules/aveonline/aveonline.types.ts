export interface AveonlineHttpResponse {
  statusCode?: number;
  data: string;
}

export interface AveonlineProvider {
  id?: number;
  nombre?: string;
  nit?: string;
  refProveedor?: string;
  estado?: string;
  [key: string]: any;
}

export interface AveonlineOrderItem {
  productRef: string;
  quantity: number;
  price: number;
  ivaValue?: number;
  weight?: number;
  name: string;
  providerId?: number | null;
}

export interface AveonlineShippingInfo {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  notes?: string;
}

export interface AveonlineCreateOrderRequest {
  numeropedidoExterno?: string;
  items: AveonlineOrderItem[];
  shipping: AveonlineShippingInfo;
}

export interface AveonlineOrderResult {
  aveonlineOrderId: string | null;
  aveonlineGuideId: string | null;
  carrier: string | null;
  status: string | null;
  providerId: number | null;
  rawResponse: any;
}

export interface AveonlineCreateOrderResponse {
  success: boolean;
  message: string;
  results: AveonlineOrderResult[];
}

export interface AveonlineTrackingData {
  status: string | null;
  lastEvent: string | null;
  carrier: string | null;
  rawResponse: any;
}

export interface AveonlineWebhookEstado {
  estado_id?: number | string;
  nombre_estado?: string;
  fechacreacion?: string;
  fechanovedad?: string;
  comentarionovedad?: string;
  [key: string]: any;
}

export interface AveonlineWebhookPayload {
  token?: string;
  guia?: string;
  pedido_id?: number | string;
  numeropedidoExterno?: string;
  estado?: string | number | AveonlineWebhookEstado[];
  fechaentrega?: string;
  [key: string]: any;
}

export const AVEONLINE_STATUS_MAP: Record<string, string> = {
  GENERADA: 'PAID',
  GENERADO: 'PAID',
  REGISTRADA: 'PAID',
  RECIBIDA: 'PAID',
  PRODUCIDA: 'PAID',
  PRODUCIDO: 'PAID',
  EMPACADA: 'PAID',
  'EN DESPACHO': 'SHIPPED',
  DESPACHADA: 'SHIPPED',
  DESPACHADO: 'SHIPPED',
  'EN REPARTO': 'SHIPPED',
  'EN RUTA': 'SHIPPED',
  'EN CAMINO': 'SHIPPED',
  'POR ENTREGAR': 'SHIPPED',
  ENTREGADA: 'DELIVERED',
  ENTREGADO: 'DELIVERED',
  NOVEDOSA: 'SHIPPED',
  NOVEDOSO: 'SHIPPED',
  'EN NOVEDAD': 'SHIPPED',
  ANULADA: 'CANCELLED',
  ANULADO: 'CANCELLED',
  CANCELADA: 'CANCELLED',
  CANCELADO: 'CANCELLED',
};

export const AVEONLINE_BASE_HOST = 'app.aveonline.co';
export const AVEONLINE_WEBHOOK_HOST = 'api.aveonline.co';
