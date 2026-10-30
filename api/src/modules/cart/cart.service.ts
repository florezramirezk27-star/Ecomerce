import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  effectiveStock,
  findProductVariation,
} from '../../common/utils/product-variations';
import { getLineUnitPrice } from '../../common/utils/product-promotion';

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
   *
   * `promotion` marca la linea como comprada desde el selector de promociones
   * de la landing: solo esas lineas se cobran con el precio de oferta por
   * cantidad. La marca es de ida (nunca se quita): si la mitad de la linea
   * compro con promocion, cobrarle despues a precio normal seria cobrarle mas
   * de lo que ofrecio la landing.
   */
  async addToCart(
    userId: string,
    productId: string,
    quantity: number,
    variationId = 0,
    promotion = false,
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
          promotion,
        },
        /* La marca solo sube: si la linea ya venia de la promocion, un alta
           normal posterior no la quita (ver doc de addToCart). */
        update: {
          quantity: { increment: quantity },
          ...(promotion ? { promotion: true } : {}),
        },
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
      // La promocion por cantidad solo aplica a las lineas que la eligieron
      // en la landing; las normales pagan el precio por unidad.
      const price = getLineUnitPrice(item.product, item.quantity, item.promotion);
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
