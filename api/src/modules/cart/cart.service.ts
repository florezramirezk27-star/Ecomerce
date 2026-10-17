import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  effectiveStock,
  findProductVariation,
} from '../../common/utils/product-variations';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrega una presentacion al carrito.
   *
   * `variationId` es 0 cuando el producto es simple (o el cliente no eligio
   * presentacion). Si el producto tiene presentaciones, se valida contra la
   * elegida y se guarda su nombre, para mostrarlo y para que el pedido lo
   * arrastre hasta Dropi.
   */
  async addToCart(
    userId: string,
    productId: string,
    quantity: number,
    variationId = 0,
  ) {
    if (quantity > 100) {
      throw new BadRequestException('Cantidad inválida');
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BadRequestException('Producto no encontrado');
    }

    if (!product.active) {
      throw new BadRequestException('Producto no disponible');
    }

    // Presentacion elegida. Si no existe entre las del producto, se rechaza:
    // con un id inventado el pedido llegaria a Dropi y lo rechazaria alla.
    const variation = findProductVariation(product.variations, variationId);
    if (variationId > 0 && !variation) {
      throw new BadRequestException('La presentación seleccionada no existe');
    }
    const variationName = variation ? variation.name : null;

    // El stock a validar es el de la presentacion elegida, no el total: el
    // total es la suma de todas y dejaria vender una ya agotada.
    const available = effectiveStock(product, variationId);

    if (quantity > available) {
      throw new BadRequestException('Stock insuficiente');
    }

    return this.prisma.$transaction(async (tx) => {
      // La presentacion entra en la llave unica: el mismo producto puede estar
      // dos veces en el carrito, una por variante.
      const item = await tx.cartItem.upsert({
        where: {
          cartId_productId_variationId: {
            cartId: cart.id,
            productId,
            variationId,
          },
        },
        create: {
          cartId: cart.id,
          productId,
          quantity,
          variationId,
          variationName,
        },
        update: { quantity: { increment: quantity } },
      });

      if (item.quantity > available) {
        throw new BadRequestException('Stock insuficiente');
      }

      return item;
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
        variationName: item.variationName,
        price,
        quantity,
        subtotal: price * quantity,
      };
    });

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

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

  async updateQuantity(userId: string, cartItemId: string, quantity: number) {
    if (quantity > 100) {
      throw new BadRequestException('Cantidad inválida');
    }

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
      include: { product: true },
    });

    if (!item) {
      throw new BadRequestException('Producto no encontrado en el carrito');
    }

    if (!item.product.active) {
      throw new BadRequestException('Producto no disponible');
    }

    // Contra la presentacion elegida en la fila, no contra el stock total.
    const available = effectiveStock(item.product, item.variationId);
    if (quantity > available) {
      throw new BadRequestException('Stock insuficiente');
    }

    return this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
  }
}
