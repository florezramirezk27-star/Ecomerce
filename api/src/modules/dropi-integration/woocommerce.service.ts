import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiTrackingService } from '../dropi/dropi.tracking';

export type FullOrder = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: true } };
    tracking: true;
  };
}>;

export interface DropiWebhookBody {
  id?: number | string;
  number?: number | string;
  status?: string | { label?: string; display?: string };
  meta_data?: Array<{ key?: string; value?: unknown }>;
  shipping_lines?: Array<{ method_title?: string }>;
  [key: string]: unknown;
}

const INTERNAL_TO_WC: Record<string, string> = {
  PENDING: 'pending',
  PAID: 'processing',
  SHIPPED: 'completed',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

const WC_TO_INTERNAL: Record<string, string> = {
  pending: 'PENDING',
  'on-hold': 'PENDING',
  processing: 'PAID',
  completed: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  refunded: 'CANCELLED',
  failed: 'CANCELLED',
  trash: 'CANCELLED',
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const GUIDE_KEY_RE = /gu[ií]a|guide|track|shipment|env[ií]o|radicado/i;
const CARRIER_KEY_RE = /carrier|transportadora|transportador|courier/i;

function safeNumericId(value: unknown): number {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return 0;
}

function primitiveString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function extractStatus(status?: DropiWebhookBody['status']): string | null {
  if (!status) return null;
  if (typeof status === 'string') return status;
  return status.display ?? status.label ?? null;
}

interface WooListParams {
  page?: string;
  perPage?: string;
  status?: string | string[];
  search?: string;
}

export interface WooListResult {
  items: WooCommerceOrder[];
  total: number;
  totalPages: number;
}

export interface WooCommerceOrder {
  id: number;
  number: number;
  status: string;
  currency: 'COP';
  date_created: string;
  date_modified: string;
  customer_note: string;
  total: string;
  billing: WooAddress;
  shipping: WooAddress;
  line_items: WooLineItem[];
  shipping_lines: Array<{
    id: number;
    method_title: string;
    method_id: string;
    total: string;
  }>;
  meta_data: Array<{ key: string; value: string }>;
}

interface WooAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: 'CO';
  email: string;
  phone: string;
}

interface WooLineItem {
  id: string;
  product_id: number;
  name: string;
  quantity: number;
  price: string;
  subtotal: string;
  total: string;
}

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dropiTracking: DropiTrackingService,
  ) {}

  async listOrders(query: WooListParams): Promise<WooListResult> {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(query.perPage ?? '10', 10) || 10),
    );

    const statuses = Array.isArray(query.status)
      ? query.status
      : query.status
        ? [query.status]
        : [];

    const internalStatuses = statuses
      .map((s) => WC_TO_INTERNAL[s.toLowerCase()])
      .filter((s): s is OrderStatus => Boolean(s));

    const search = query.search?.trim();
    const searchIsNumeric = search ? /^\d+$/.test(search) : false;

    const where: Prisma.OrderWhereInput = {};
    if (internalStatuses.length > 0) {
      where.status = { in: internalStatuses };
    }
    if (search) {
      const conditions: Prisma.OrderWhereInput[] = [];
      if (searchIsNumeric) {
        conditions.push({ numericId: parseInt(search, 10) });
      }
      conditions.push({
        OR: [
          { shippingName: { contains: search, mode: 'insensitive' } },
          { shippingCity: { contains: search, mode: 'insensitive' } },
          {
            items: {
              some: {
                product: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
      where.OR = conditions;
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          items: {
            include: { product: true },
          },
          tracking: true,
        },
        orderBy: { numericId: 'desc' },
      }),
    ]);

    return {
      items: orders.map((o) => this.toWooCommerceOrder(o)),
      total,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getOrderByNumericId(numericId: number): Promise<WooCommerceOrder> {
    const order = await this.prisma.order.findUnique({
      where: { numericId },
      include: {
        items: {
          include: { product: true },
        },
        tracking: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${numericId} no encontrado`);
    }
    return this.toWooCommerceOrder(order);
  }

  async applyDropiUpdate(
    numericId: number,
    body: DropiWebhookBody,
  ): Promise<WooCommerceOrder> {
    const order = await this.prisma.order.findUnique({
      where: { numericId },
      include: {
        items: {
          include: { product: true },
        },
        tracking: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${numericId} no encontrado`);
    }

    const wcStatus = extractStatus(body.status);
    const internalStatus = wcStatus
      ? WC_TO_INTERNAL[wcStatus.toLowerCase()]
      : undefined;

    const meta = this.extractMeta(body);
    const allowed = VALID_TRANSITIONS[order.status] || [];
    const canTransition = internalStatus && allowed.includes(internalStatus);

    if (canTransition && internalStatus !== order.status) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: internalStatus as OrderStatus },
      });
    } else if (internalStatus && internalStatus !== order.status) {
      this.logger.warn(
        `[Dropi] Transición inválida ${order.status} -> ${internalStatus} para pedido ${numericId}`,
      );
    }

    const carrier =
      meta.carrier ?? body.shipping_lines?.[0]?.method_title ?? null;
    const lastEvent = meta.guideNumber ?? null;

    await this.dropiTracking.upsertTracking(order.id, {
      dropiOrderId: meta.dropiOrderId ?? `WC-${numericId}`,
      dropiGuideId: meta.dropiGuideId,
      carrier,
      status: meta.dropiGuideId ? 'SHIPPED' : (internalStatus ?? null),
      lastEvent,
      rawResponse: body,
    });

    const updated = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: { include: { product: true } },
        tracking: true,
      },
    });
    if (!updated) {
      throw new NotFoundException(`Pedido ${numericId} no encontrado`);
    }

    this.logger.log(
      `[Dropi] Pedido ${numericId} actualizado (${order.status}${internalStatus ? ' -> ' + internalStatus : ''})`,
    );

    return this.toWooCommerceOrder(updated);
  }

  toWooCommerceOrder(order: FullOrder): WooCommerceOrder {
    const address: WooAddress = {
      first_name: order.shippingName ?? '',
      last_name: '',
      address_1: order.shippingAddress ?? '',
      address_2: '',
      city: order.shippingCity ?? '',
      state: order.shippingState ?? '',
      postcode: order.shippingZip ?? '',
      country: 'CO',
      email: order.shippingEmail ?? '',
      phone: order.shippingPhone ?? '',
    };

    return {
      id: order.numericId,
      number: order.numericId,
      status: INTERNAL_TO_WC[order.status] || order.status.toLowerCase(),
      currency: 'COP',
      date_created: order.createdAt.toISOString(),
      date_modified: order.updatedAt.toISOString(),
      customer_note: order.notes ?? '',
      total: Number(order.total).toFixed(2),
      billing: address,
      shipping: address,
      line_items: order.items.map((item) => ({
        id: item.id,
        product_id: safeNumericId(item.product.dropiProductId),
        name: item.product.name,
        quantity: item.quantity,
        price: Number(item.price).toFixed(2),
        subtotal: (Number(item.price) * item.quantity).toFixed(2),
        total: (Number(item.price) * item.quantity).toFixed(2),
      })),
      shipping_lines: [
        {
          id: 0,
          method_title: order.tracking?.carrier ?? 'Envío',
          method_id: 'dropi',
          total: '0.00',
        },
      ],
      meta_data: [
        { key: 'dropi_guide_id', value: order.tracking?.dropiGuideId ?? '' },
        { key: 'dropi_tracking_url', value: order.tracking?.trackingUrl ?? '' },
        { key: 'dropi_guide_pdf', value: order.tracking?.guidePdfUrl ?? '' },
      ],
    };
  }

  private extractMeta(body: DropiWebhookBody): {
    dropiGuideId?: string;
    dropiOrderId?: string;
    carrier?: string;
    guideNumber?: string;
  } {
    const metaData: Array<{ key?: string; value?: unknown }> = Array.isArray(
      body.meta_data,
    )
      ? body.meta_data
      : [];

    let guideId: string | undefined;
    let carrier: string | undefined;

    for (const entry of metaData) {
      if (!entry || typeof entry !== 'object') continue;
      const key = String(entry.key ?? '');
      if (entry.value == null) continue;

      const value = primitiveString(entry.value ?? body[key]);

      if (GUIDE_KEY_RE.test(key) || /guide/i.test(value)) {
        guideId = value.trim() || guideId;
      }
      if (CARRIER_KEY_RE.test(key) && value) {
        carrier = value.trim() || carrier;
      }
    }

    return {
      dropiGuideId: guideId,
      carrier,
      guideNumber: guideId,
    };
  }
}
