import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async addToCart(userId: string, productId: string, quantity: number) {
    if (quantity > 100) {
      throw new BadRequestException('Cantidad inválida');
    }

    let cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          userId,
        },
      });
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BadRequestException('Producto no encontrado');
    }

    if (!product.active) {
      throw new BadRequestException('Producto no disponible');
    }

    if (quantity > product.stock) {
      throw new BadRequestException('Stock insuficiente');
    }

    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
      },
    });

    if (existingItem) {
      if (existingItem.quantity + quantity > product.stock) {
        throw new BadRequestException('Stock insuficiente');
      }

      return this.prisma.cartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          quantity: existingItem.quantity + quantity,
        },
      });
    }

    return this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity,
      },
    });
  }

  async getCartTotal(userId: string) {
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

    if (!cart) {
      return {
        cartId: null,
        total: 0,
        items: [],
      };
    }

    const items = cart.items.map((item) => {
      const price = Number(item.product.price);
      const quantity = item.quantity;

      return {
        productId: item.product.id,
        name: item.product.name,
        price,
        quantity,
        subtotal: price * quantity,
      };
    });

    const total = items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    return {
      cartId: cart.id,
      total,
      items,
    };
  }

  async getCart(userId: string) {
    return this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async removeItem(userId: string, cartItemId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new BadRequestException('Carrito no encontrado');
    }

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: cartItemId,
        cartId: cart.id,
      },
    });

    if (!item) {
      throw new BadRequestException('Producto no encontrado en el carrito');
    }

    return this.prisma.cartItem.delete({
      where: { id: cartItemId },
    });
  }
}
