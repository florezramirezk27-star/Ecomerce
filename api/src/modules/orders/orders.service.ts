import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CheckoutDto } from './dto/checkout.dto';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
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
      throw new BadRequestException(
        'Cart is empty',
      );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const productIds = cart.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      const total = cart.items.reduce(
        (sum, item) => {
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

          return (
            sum +
            Number(item.product.price) *
              item.quantity
          );
        },
        0,
      );

      const order = await tx.order.create({
        data: {
          userId,
          total,
          paymentMethod: 'CASH_ON_DELIVERY',

          shippingName: dto.shippingName,
          shippingPhone: dto.shippingPhone,
          shippingAddress: dto.shippingAddress,
          shippingCity: dto.shippingCity,
          shippingState: dto.shippingState,
          shippingZip: dto.shippingZip || null,
          shippingEmail: dto.shippingEmail || null,
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

      return order;
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user) {
      this.mailService.sendOrderConfirmationEmail(
        dto.shippingEmail || user.email,
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
          email: dto.shippingEmail,
          address: dto.shippingAddress,
          city: dto.shippingCity,
          state: dto.shippingState,
          zip: dto.shippingZip,
          notes: dto.notes,
        },
      );
    }

    return order;
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

  async updateStatus(
    id: string,
    status: string,
  ) {
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
