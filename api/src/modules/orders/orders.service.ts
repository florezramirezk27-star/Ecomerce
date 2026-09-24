import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { DropiService } from '../dropi/dropi.service';
import { CheckoutDto } from './dto/checkout.dto';

type ShippingLike = {
  name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  state: string;
  zip?: string | null;
  notes?: string | null;
  docType?: string | null;
  docNumber?: string | null;
};

type OrderItemDetail = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  dropiProductId: number | null;
};

type DropiResult = {
  success: boolean | null;
  message: string;
  orderId: string | null;
  carrier: string | null;
  raw: unknown;
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly dropiService: DropiService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { items: true },
      });
      if (existing) {
        return this.processExistingOrder(existing, user, dto);
      }
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Tu carrito está vacío');
    }

    const customerEmail = dto.shippingEmail || user?.email || null;

    const dropiCartItems = cart.items.filter((i) => i.product.dropiProductId);
    if (dropiCartItems.length > 0) {
      const stockCheck = await this.dropiService.validateStock(
        dropiCartItems.map((i) => ({
          dropiProductId: i.product.dropiProductId!,
          quantity: i.quantity,
          name: i.product.name,
        })),
      );

      if (!stockCheck.ok) {
        const insufficient = stockCheck.insufficient
          .map(
            (s) =>
              `${s.name} (solicitado: ${s.requested}, disponible en Dropi: ${s.available})`,
          )
          .join(', ');
        throw new BadRequestException(
          `Stock insuficiente en proveedor para: ${insufficient}`,
        );
      }
    }

    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const productIds = cart.items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));

        const total = cart.items.reduce((sum, item) => {
          const product = productMap.get(item.productId);

          if (!product || !product.active) {
            throw new BadRequestException(
              `El producto ${item.product.name} no está disponible`,
            );
          }

          if (item.quantity > product.stock) {
            throw new BadRequestException(
              `No hay suficiente stock para ${item.product.name}`,
            );
          }

          return sum + Number(item.product.price) * item.quantity;
        }, 0);

        const created = await tx.order.create({
          data: {
            userId,
            total,
            paymentMethod: 'CASH_ON_DELIVERY',
            idempotencyKey: dto.idempotencyKey || null,

            shippingName: dto.shippingName,
            shippingPhone: dto.shippingPhone,
            shippingAddress: dto.shippingAddress,
            shippingCity: dto.shippingCity,
            shippingState: dto.shippingState,
            shippingZip: dto.shippingZip || null,
            shippingEmail: customerEmail,
            notes: dto.notes || null,

            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.product.price,
              })),
            },
          },

          include: {
            items: true,
          },
        });

        for (const item of cart.items) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });

          if (updated.count === 0) {
            throw new BadRequestException(
              `No hay suficiente stock para ${item.product.name}`,
            );
          }
        }

        await tx.cartItem.deleteMany({
          where: {
            cartId: cart.id,
          },
        });

        return created;
      });
    } catch (err: any) {
      if (err?.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.prisma.order.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { items: true },
        });
        if (existing) {
          return this.processExistingOrder(existing, user, dto);
        }
      }
      throw err;
    }

    if (user && customerEmail) {
      const emailTask = this.mailService.sendOrderConfirmationEmail(
        customerEmail,
        user.name,
        order.id,
        cart.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: Number(item.product.price),
        })),
        Number(order.total),
        {
          name: dto.shippingName,
          phone: dto.shippingPhone,
          email: customerEmail,
          address: dto.shippingAddress,
          city: dto.shippingCity,
          state: dto.shippingState,
          zip: dto.shippingZip,
          notes: dto.notes,
          docType: dto.shippingDocType,
          docNumber: dto.shippingDocNumber,
        },
      );
      void emailTask.then(
        (sent) => {
          if (!sent) {
            this.logger.warn(
              `No se pudo enviar la factura a ${customerEmail} (pedido ${order.id})`,
            );
          }
        },
        (err) => {
          this.logger.error(
            `Error enviando factura a ${customerEmail}: ${err instanceof Error ? err.message : err}`,
          );
        },
      );
    }

    const dropiItems = cart.items.filter((i) => i.product.dropiProductId);

    let dropiResult: {
      success: boolean | null;
      message: string;
      orderId: string | null;
      carrier: string | null;
      raw: unknown;
    };

    if (dropiItems.length > 0) {
      try {
        const result = await this.dropiService.createOrder(
          {
            items: dropiItems.map((i) => ({
              dropiProductId: i.product.dropiProductId!,
              quantity: i.quantity,
              price: Number(i.product.price),
              name: i.product.name,
            })),
            shipping: {
              name: dto.shippingName,
              phone: dto.shippingPhone,
              email: customerEmail || undefined,
              address: dto.shippingAddress,
              city: dto.shippingCity,
              state: dto.shippingState,
              zip: dto.shippingZip || undefined,
              docType: dto.shippingDocType || undefined,
              docNumber: dto.shippingDocNumber || undefined,
              notes: dto.notes || undefined,
            },
          },
          order.id,
        );
        const firstOk = result.results.find((r) => r.dropiOrderId) || null;
        dropiResult = {
          success: result.success,
          message: result.message,
          orderId: firstOk?.dropiOrderId ?? null,
          carrier: firstOk?.carrier ?? null,
          raw: result.results,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        dropiResult = {
          success: false,
          message: `Dropi error: ${message}`,
          orderId: null,
          carrier: null,
          raw: { error: message },
        };
      }
    } else {
      dropiResult = {
        success: null,
        message: 'Pedido sin productos de proveedor; no aplica Dropi',
        orderId: null,
        carrier: null,
        raw: null,
      };
    }

    if (dropiItems.length > 0) {
      try {
        await this.prisma.orderTracking.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            dropiOrderId: dropiResult.orderId
              ? String(dropiResult.orderId)
              : null,
            carrier: dropiResult.carrier,
            status: dropiResult.success ? 'CREATED' : 'PENDING',
            lastEvent: dropiResult.message,
            rawResponse: dropiResult.raw as Prisma.InputJsonValue,
            checkedAt: new Date(),
          },
          update: {
            dropiOrderId: dropiResult.orderId
              ? String(dropiResult.orderId)
              : null,
            carrier: dropiResult.carrier,
            status: dropiResult.success ? 'CREATED' : 'PENDING',
            lastEvent: dropiResult.message,
            rawResponse: dropiResult.raw as Prisma.InputJsonValue,
            checkedAt: new Date(),
          },
        });
      } catch (err) {
        this.logger.error(
          `No se pudo guardar el tracking de Dropi para ${order.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    const adminEmail =
      process.env.ADMIN_EMAIL || process.env.ADMIN_GOOGLE_EMAIL || '';
    if (adminEmail) {
      const adminTask = this.mailService.sendAdminOrderNotification(
        adminEmail,
        user?.name || dto.shippingName,
        customerEmail || null,
        order.id,
        cart.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: Number(item.product.price),
        })),
        Number(order.total),
        {
          name: dto.shippingName,
          phone: dto.shippingPhone,
          email: customerEmail,
          address: dto.shippingAddress,
          city: dto.shippingCity,
          state: dto.shippingState,
          zip: dto.shippingZip,
          notes: dto.notes,
          docType: dto.shippingDocType,
          docNumber: dto.shippingDocNumber,
        },
        dropiResult?.message,
      );
      void adminTask.then(
        (sent) => {
          if (!sent) {
            this.logger.warn(
              `No se pudo notificar al admin sobre el pedido ${order.id}`,
            );
          }
        },
        (err) => {
          this.logger.error(
            `Error notificando al admin (pedido ${order.id}): ${err instanceof Error ? err.message : err}`,
          );
        },
      );
    }

    return {
      ...order,
      dropi: {
        success: dropiResult?.success ?? null,
        message: dropiResult?.message ?? 'Sin integración con proveedor',
        orderId: dropiResult?.orderId ?? null,
      },
      emails: {
        customer: customerEmail ? 'queued' : 'skipped',
        admin: adminEmail ? 'queued' : 'skipped',
      },
    };
  }

  private async processExistingOrder(
    order: {
      id: string;
      total: Prisma.Decimal;
      shippingName: string | null;
      shippingPhone: string | null;
      shippingEmail: string | null;
      shippingAddress: string | null;
      shippingCity: string | null;
      shippingState: string | null;
      shippingZip: string | null;
      notes: string | null;
      items: {
        productId: string;
        quantity: number;
        price: Prisma.Decimal;
      }[];
    },
    user: { id: string; name: string; email: string } | null,
    dto: CheckoutDto,
    force = false,
  ) {
    const productIds = order.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const itemDetails: OrderItemDetail[] = order.items.map((it, idx) => ({
      productId: it.productId,
      name: productMap.get(it.productId)?.name ?? `Producto ${idx + 1}`,
      quantity: it.quantity,
      price: Number(it.price),
      dropiProductId: productMap.get(it.productId)?.dropiProductId ?? null,
    }));

    const customerEmail = order.shippingEmail || user?.email || null;

    const shipping: ShippingLike = {
      name: order.shippingName || dto.shippingName || '',
      phone: order.shippingPhone || dto.shippingPhone || '',
      email: customerEmail,
      address: order.shippingAddress || dto.shippingAddress || '',
      city: order.shippingCity || dto.shippingCity || '',
      state: order.shippingState || dto.shippingState || '',
      zip: order.shippingZip || dto.shippingZip || undefined,
      notes: order.notes || dto.notes || undefined,
      docType: dto.shippingDocType,
      docNumber: dto.shippingDocNumber,
    };

    const dropiItems = itemDetails.filter((i) => i.dropiProductId);

    const tracking = await this.prisma.orderTracking.findUnique({
      where: { orderId: order.id },
    });
    const alreadyInDropi = !!tracking?.dropiOrderId;

    let dropiResult: DropiResult;
    if (dropiItems.length === 0) {
      dropiResult = {
        success: null,
        message: 'Pedido sin productos de proveedor; no aplica Dropi',
        orderId: null,
        carrier: null,
        raw: null,
      };
    } else if (alreadyInDropi) {
      dropiResult = {
        success: true,
        message: tracking!.lastEvent || 'Orden ya creada en Dropi',
        orderId: tracking!.dropiOrderId,
        carrier: tracking!.carrier ?? null,
        raw: tracking!.rawResponse ?? null,
      };
      this.logger.log(
        `Dropi ya procesado para ${order.id} (${tracking!.dropiOrderId}); se omite reenvío`,
      );
    } else {
      try {
        const result = await this.dropiService.createOrder(
          {
            items: dropiItems.map((i) => ({
              dropiProductId: i.dropiProductId!,
              quantity: i.quantity,
              price: i.price,
              name: i.name,
            })),
            shipping: {
              name: shipping.name,
              phone: shipping.phone,
              email: customerEmail || undefined,
              address: shipping.address,
              city: shipping.city,
              state: shipping.state,
              zip: shipping.zip || undefined,
              docType: shipping.docType || undefined,
              docNumber: shipping.docNumber || undefined,
              notes: shipping.notes || undefined,
            },
          },
          order.id,
        );
        const firstOk = result.results.find((r) => r.dropiOrderId) || null;
        dropiResult = {
          success: result.success,
          message: result.message,
          orderId: firstOk?.dropiOrderId ?? null,
          carrier: firstOk?.carrier ?? null,
          raw: result.results,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        this.logger.error(
          `Dropi: error creando orden ${order.id}: ${message}`,
        );
        dropiResult = {
          success: false,
          message: `Dropi error: ${message}`,
          orderId: null,
          carrier: null,
          raw: { error: message },
        };
      }

      try {
        await this.prisma.orderTracking.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            dropiOrderId: dropiResult.orderId
              ? String(dropiResult.orderId)
              : null,
            carrier: dropiResult.carrier,
            status: dropiResult.success ? 'CREATED' : 'PENDING',
            lastEvent: dropiResult.message,
            rawResponse: dropiResult.raw as Prisma.InputJsonValue,
            checkedAt: new Date(),
          },
          update: {
            dropiOrderId: dropiResult.orderId
              ? String(dropiResult.orderId)
              : null,
            carrier: dropiResult.carrier,
            status: dropiResult.success ? 'CREATED' : 'PENDING',
            lastEvent: dropiResult.message,
            rawResponse: dropiResult.raw as Prisma.InputJsonValue,
            checkedAt: new Date(),
          },
        });
      } catch (err) {
        this.logger.error(
          `No se pudo guardar el tracking de Dropi para ${order.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    const itemSummary = itemDetails.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
    }));

    const adminEmail =
      process.env.ADMIN_EMAIL || process.env.ADMIN_GOOGLE_EMAIL || '';
    const skipEmails = alreadyInDropi && !force;

    let customerQueued = false;
    let adminQueued = false;

    if (!skipEmails) {
      if (user && customerEmail) {
        customerQueued = true;
        void this.mailService
          .sendOrderConfirmationEmail(
            customerEmail,
            user.name || shipping.name,
            order.id,
            itemSummary,
            Number(order.total),
            shipping,
          )
          .then(
            (sent) => {
              if (!sent) {
                this.logger.warn(
                  `No se pudo enviar la factura a ${customerEmail} (pedido ${order.id})`,
                );
              }
            },
            (err) => {
              this.logger.error(
                `Error enviando factura a ${customerEmail}: ${err instanceof Error ? err.message : err}`,
              );
            },
          );
      }

      if (adminEmail) {
        adminQueued = true;
        void this.mailService
          .sendAdminOrderNotification(
            adminEmail,
            user?.name || shipping.name,
            customerEmail || null,
            order.id,
            itemSummary,
            Number(order.total),
            shipping,
            dropiResult?.message,
          )
          .then(
            (sent) => {
              if (!sent) {
                this.logger.warn(
                  `No se pudo notificar al admin sobre el pedido ${order.id}`,
                );
              }
            },
            (err) => {
              this.logger.error(
                `Error notificando al admin (pedido ${order.id}): ${err instanceof Error ? err.message : err}`,
              );
            },
          );
      }
    }

    return {
      ...order,
      dropi: {
        success: dropiResult?.success ?? null,
        message: dropiResult?.message ?? 'Sin integración con proveedor',
        orderId: dropiResult?.orderId ?? null,
      },
      emails: {
        customer: skipEmails
          ? 'skipped'
          : customerQueued
            ? 'queued'
            : 'skipped',
        admin: skipEmails ? 'skipped' : adminQueued ? 'queued' : 'skipped',
      },
    };
  }

  async reprocessOrder(orderId: string, force = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true },
    });

    if (!order) {
      throw new BadRequestException('Orden no encontrada');
    }

    this.logger.log(
      `Reprocesando orden ${order.id} (forceEmails=${force})`,
    );
    return this.processExistingOrder(
      order,
      order.user
        ? { id: order.user.id, name: order.user.name, email: order.user.email }
        : null,
      {} as CheckoutDto,
      force,
    );
  }

  async findMyOrders(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.findMany({
        skip,
        take: limit,
        where: {
          userId,
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.findMany({
        skip,
        take: limit,
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateStatus(id: string, status: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        user: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Orden no encontrada');
    }

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed?.includes(status)) {
      throw new UnprocessableEntityException(
        `No se puede cambiar de ${order.status} a ${status}`,
      );
    }

    let updatedOrder;

    if (status === 'CANCELLED') {
      const tracking = await this.prisma.orderTracking.findUnique({
        where: { orderId: id },
      });
      const dropiOrderId = tracking?.dropiOrderId;

      let dropiCancel: Awaited<ReturnType<DropiService['cancelOrder']>> | null =
        null;
      if (dropiOrderId) {
        try {
          dropiCancel = await this.dropiService.cancelOrder(
            Number(dropiOrderId),
          );
        } catch (e: any) {
          dropiCancel = {
            success: false,
            error: e.message || 'Error al cancelar en Dropi',
            rawResponse: null,
          };
        }
        if (tracking) {
          await this.prisma.orderTracking.update({
            where: { orderId: id },
            data: {
              status: dropiCancel.success
                ? 'CANCELLED'
                : tracking.status || dropiCancel.error,
              lastEvent: dropiCancel.success
                ? 'Cancelada en Dropi'
                : `Error al cancelar en Dropi: ${dropiCancel.error || ''}`,
              checkedAt: new Date(),
            },
          });
        }
      }

      updatedOrder = await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: item.quantity,
              },
            },
          });
        }

        return tx.order.update({
          where: { id },
          data: {
            status: status as any,
          },
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });
      });
    } else {
      updatedOrder = await this.prisma.order.update({
        where: { id },
        data: {
          status: status as any,
        },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    }

    if (order.user) {
      this.mailService.sendOrderStatusEmail(
        order.user.email,
        order.user.name,
        order.id,
        status,
      );
    }

    if (status === 'CANCELLED') {
      const adminEmail =
        process.env.ADMIN_EMAIL || process.env.ADMIN_GOOGLE_EMAIL || '';
      if (adminEmail) {
        this.mailService.sendOrderStatusEmail(
          adminEmail,
          'Admin',
          order.id,
          status,
        );
      }
    }

    return updatedOrder;
  }

  async findOne(id: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Orden no encontrada');
    }

    if (userRole !== 'ADMIN' && order.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver esta orden');
    }

    return order;
  }
}
