import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaService } from '../../prisma/prisma.service';

interface FakeProduct {
  id: string;
  active: boolean;
  stock: number;
  variations?: unknown;
}

/**
 * Arma el servicio con un Prisma minimo.
 *
 * El `upsert` del item devuelve la fila que el servicio va a leer despues del
 * `increment`, por eso hay que simular la suma: si devolviera siempre la
 * cantidad del `create`, la validacion de stock de una fila ya existente
 * pasaria sin probar nada.
 */
function makeService(opts: {
  product?: FakeProduct;
  existingQuantity?: number;
}) {
  const cartItemUpsert = jest.fn(
    (args: {
      create: {
        quantity: number;
        variationId: number;
        variationName: string | null;
      };
    }) => ({
      id: 'item1',
      quantity: (opts.existingQuantity ?? 0) + args.create.quantity,
      variationId: args.create.variationId,
      variationName: args.create.variationName,
    }),
  );

  const prisma = {
    cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart1' }) },
    product: { findUnique: jest.fn().mockResolvedValue(opts.product ?? null) },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({ cartItem: { upsert: cartItemUpsert } }),
    ),
  } as unknown as PrismaService;

  return { service: new CartService(prisma), cartItemUpsert };
}

const variableProduct: FakeProduct = {
  id: 'p1',
  active: true,
  stock: 10,
  variations: [
    { id: 10, name: 'Talla M', stock: 5 },
    { id: 11, name: 'Talla G', stock: 0 },
  ],
};

describe('CartService.addToCart: presentaciones', () => {
  it('guarda la presentacion elegida junto con su nombre', async () => {
    const { service, cartItemUpsert } = makeService({
      product: variableProduct,
    });

    await service.addToCart('u1', 'p1', 2, 10);

    expect(cartItemUpsert).toHaveBeenCalledWith({
      where: {
        cartId_productId_variationId: {
          cartId: 'cart1',
          productId: 'p1',
          variationId: 10,
        },
      },
      create: {
        cartId: 'cart1',
        productId: 'p1',
        quantity: 2,
        variationId: 10,
        variationName: 'Talla M',
      },
      update: { quantity: { increment: 2 } },
    });
  });

  it('rechaza una presentacion que no existe en el producto', async () => {
    // Con un id inventado el pedido llegaria a Dropi y lo rechazaria alla: es
    // mejor cortarlo antes.
    const { service, cartItemUpsert } = makeService({
      product: variableProduct,
    });

    await expect(service.addToCart('u1', 'p1', 1, 999)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addToCart('u1', 'p1', 1, 999)).rejects.toThrow(
      'La presentación seleccionada no existe',
    );
    expect(cartItemUpsert).not.toHaveBeenCalled();
  });

  it('valida contra el stock de la presentacion, no contra el total', async () => {
    // El total es 5 (10 + 0 no: la 10 tiene 5). Se pide una variante agotada
    // (11, stock 0) o mas de lo que hay en una: no debe dejar pasar el stock
    // total del producto.
    const { service } = makeService({ product: variableProduct });

    await expect(service.addToCart('u1', 'p1', 1, 11)).rejects.toThrow(
      'Stock insuficiente',
    );
    await expect(service.addToCart('u1', 'p1', 6, 10)).rejects.toThrow(
      'Stock insuficiente',
    );
  });

  it('toma el stock total cuando el producto es simple (sin presentacion)', async () => {
    const { service, cartItemUpsert } = makeService({
      product: { id: 'p2', active: true, stock: 3, variations: null },
    });

    await service.addToCart('u1', 'p2', 2);

    expect(cartItemUpsert).toHaveBeenCalledWith({
      where: {
        cartId_productId_variationId: {
          cartId: 'cart1',
          productId: 'p2',
          variationId: 0,
        },
      },
      create: {
        cartId: 'cart1',
        productId: 'p2',
        quantity: 2,
        variationId: 0,
        variationName: null,
      },
      update: { quantity: { increment: 2 } },
    });
  });

  it('valida la cantidad sumada contra el stock de la presentacion', async () => {
    // Ya hay 1 en el carrito y se agregan 5: la variante solo tiene 5, asi que
    // el total de la fila (6) no cabe.
    const { service } = makeService({
      product: variableProduct,
      existingQuantity: 1,
    });

    await expect(service.addToCart('u1', 'p1', 5, 10)).rejects.toThrow(
      'Stock insuficiente',
    );
  });
});
