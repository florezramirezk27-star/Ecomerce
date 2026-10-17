import { DropiProductsService, DropiProduct } from './dropi.products';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';

function makeService(): DropiProductsService {
  return new DropiProductsService(
    {} as DropiClient,
    {} as DropiAuthService,
    {} as PrismaService,
    {} as CatalogCacheService,
  );
}

function variableProduct(variations: { stock?: number }[]): DropiProduct {
  return {
    name: 'Camiseta',
    type: 'VARIABLE',
    variations,
    warehouse_product: [{ warehouse_id: 1, stock: 42 }],
  };
}

describe('DropiProductsService.computeStock', () => {
  it('suma el stock de las variaciones de un producto VARIABLE', () => {
    const service = makeService();

    const stock = service.computeStock(
      variableProduct([{ stock: 3 }, { stock: 4 }, { stock: 5 }]),
    );

    expect(stock).toBe(12);
  });

  it('cae a warehouse_product cuando variations viene vacío', () => {
    // La regresion: un arreglo vacio es truthy, asi que el reduce daba 0 y
    // nunca se usaba la bodega. El producto se veia con stock en Dropi pero el
    // backend calculaba 0 y bloqueaba la venta.
    const service = makeService();

    const stock = service.computeStock(variableProduct([]));

    expect(stock).toBe(42);
  });

  it('usa warehouse_product para un producto SIMPLE', () => {
    const service = makeService();

    const stock = service.computeStock({
      name: 'Reloj',
      type: 'SIMPLE',
      warehouse_product: [
        { warehouse_id: 1, stock: 10 },
        { warehouse_id: 2, stock: 7 },
      ],
    });

    expect(stock).toBe(17);
  });

  it('devuelve 0 cuando no hay datos de stock', () => {
    const service = makeService();

    expect(service.computeStock({ name: 'X' })).toBe(0);
  });
});

describe('DropiProductsService: exito del catalogo', () => {
  /**
   * Dropi cambio la grafia del flag (`is_succesfull` -> `is_successful`). Si el
   * catalogo se lee como error, `getProductById` devuelve null y la orden sale
   * con el proveedor/bodega de .env: Dropi la rechaza con "las existencias han
   * variado".
   */
  function normalize(parsed: unknown) {
    const service = makeService() as unknown as {
      normalizeCatalogEnvelope: (p: unknown) => {
        isSuccess: boolean;
        objects?: unknown[];
      };
    };
    return service.normalizeCatalogEnvelope(parsed);
  }

  it('acepta is_successful (grafia nueva del BFF)', () => {
    const result = normalize({
      is_successful: true,
      status_code: 200,
      data: { objects: [{ id: 2160787 }] },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.objects).toHaveLength(1);
  });

  it('sigue aceptando is_succesfull (grafia vieja)', () => {
    expect(
      normalize({ is_succesfull: true, data: { objects: [{ id: 1 }] } })
        .isSuccess,
    ).toBe(true);
  });

  it('es exito si hay productos aunque el flag venga con otra grafia o sin el', () => {
    expect(
      normalize({
        status_reason: 'Success request',
        data: { objects: [{ id: 1 }] },
      }).isSuccess,
    ).toBe(true);
  });

  it('es fallo cuando Dropi rechaza (flag falso / 4xx) y no hay productos', () => {
    expect(
      normalize({
        is_successful: false,
        status_code: 400,
        status_reason: 'Invalid request body',
        data: null,
      }).isSuccess,
    ).toBe(false);
  });
});

describe('DropiProductsService.resolveDropshipperContext', () => {
  it('resuelve la variacion de mas stock para un producto VARIABLE', async () => {
    const service = makeService();
    jest.spyOn(service, 'getProductById').mockResolvedValue({
      name: 'Camiseta',
      type: 'VARIABLE',
      user: { id: 29151 },
      variations: [
        { id: 10, stock: 1 },
        { id: 11, stock: 9 },
        { id: 12, stock: 4 },
      ],
      warehouse_product: [{ warehouse_id: 3577, stock: 9 }],
    });

    const ctx = await service.resolveDropshipperContext(123);

    expect(ctx).not.toBeNull();
    expect(ctx?.supplierId).toBe(29151);
    expect(ctx?.variationId).toBe(11);
    expect(ctx?.warehouseId).toBe(3577);
  });

  it('devuelve la variacion aunque el producto no traiga bodegas', async () => {
    const service = makeService();
    jest.spyOn(service, 'getProductById').mockResolvedValue({
      name: 'Camiseta',
      type: 'VARIABLE',
      user: { id: 29151 },
      variations: [{ id: 10, stock: 3 }],
      warehouse_product: [],
    });

    const ctx = await service.resolveDropshipperContext(123);

    expect(ctx).not.toBeNull();
    expect(ctx?.supplierId).toBe(29151);
    expect(ctx?.variationId).toBe(10);
    expect(ctx?.warehouseId).toBeUndefined();
  });

  it('no inventa variacion para un producto SIMPLE', async () => {
    const service = makeService();
    jest.spyOn(service, 'getProductById').mockResolvedValue({
      name: 'Reloj',
      type: 'SIMPLE',
      user: { id: 29151 },
      warehouse_product: [{ warehouse_id: 3577, stock: 5 }],
    });

    const ctx = await service.resolveDropshipperContext(123);

    expect(ctx?.variationId).toBeNull();
    expect(ctx?.warehouseId).toBe(3577);
  });
});

describe('DropiProductsService.validateStock', () => {
  const item = { dropiProductId: 123, quantity: 2, name: 'Reloj' };

  it('no bloquea la venta si Dropi no se puede consultar', async () => {
    // Antes un timeout se contaba como `available: 0` y el cliente recibia
    // "stock insuficiente" aunque Dropi tuviera el producto.
    const service = makeService();
    jest
      .spyOn(service, 'getProductById')
      .mockRejectedValue(new Error('timeout'));

    const result = await service.validateStock([item]);

    expect(result.ok).toBe(true);
    expect(result.insufficient).toEqual([]);
  });

  it('no bloquea la venta si Dropi no devuelve el producto', async () => {
    const service = makeService();
    jest.spyOn(service, 'getProductById').mockResolvedValue(null);

    const result = await service.validateStock([item]);

    expect(result.ok).toBe(true);
  });

  it('bloquea solo cuando Dropi confirma stock menor al pedido', async () => {
    const service = makeService();
    jest.spyOn(service, 'getProductById').mockResolvedValue({
      name: 'Reloj',
      type: 'SIMPLE',
      warehouse_product: [{ warehouse_id: 1, stock: 1 }],
    });

    const result = await service.validateStock([item]);

    expect(result.ok).toBe(false);
    expect(result.insufficient).toEqual([
      { name: 'Reloj', requested: 2, available: 1 },
    ]);
  });

  it('deja pasar cuando Dropi tiene stock suficiente', async () => {
    const service = makeService();
    jest.spyOn(service, 'getProductById').mockResolvedValue({
      name: 'Reloj',
      type: 'SIMPLE',
      warehouse_product: [{ warehouse_id: 1, stock: 9 }],
    });

    const result = await service.validateStock([item]);

    expect(result.ok).toBe(true);
  });
});
