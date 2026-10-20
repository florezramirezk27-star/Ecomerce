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

function variableProduct(
  variations: Array<{
    id?: number;
    stock?: number;
    attribute_values?: Array<{ value?: string }>;
  }>,
): DropiProduct {
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

describe('DropiProductsService.buildVariations', () => {
  it('arma el nombre con los valores de los atributos', () => {
    const service = makeService();

    const result = service.buildVariations(
      variableProduct([
        {
          id: 10,
          stock: 3,
          attribute_values: [{ value: 'Talla M' }, { value: 'Rojo' }],
        },
      ]),
    );

    expect(result).toEqual([{ id: 10, name: 'Talla M / Rojo', stock: 3 }]);
  });

  it('usa un nombre de respaldo cuando la variante no trae atributos', () => {
    const service = makeService();

    const result = service.buildVariations(
      variableProduct([{ id: 11, stock: 0 }]),
    );

    expect(result).toEqual([{ id: 11, name: 'Presentación 11', stock: 0 }]);
  });

  it('descarta variantes sin id valido', () => {
    const service = makeService();

    const result = service.buildVariations(
      variableProduct([
        { id: 0, stock: 5 },
        { stock: 5 },
        { id: 12, stock: 2 },
      ]),
    );

    expect(result).toEqual([{ id: 12, name: 'Presentación 12', stock: 2 }]);
  });

  it('devuelve lista vacia para un producto SIMPLE', () => {
    const service = makeService();

    const result = service.buildVariations({
      name: 'Reloj',
      type: 'SIMPLE',
      warehouse_product: [{ warehouse_id: 1, stock: 5 }],
    });

    expect(result).toEqual([]);
  });
});

describe('DropiProductsService.computeAvailable', () => {
  const product = variableProduct([
    { id: 10, stock: 3 },
    { id: 11, stock: 0 },
  ]);

  it('devuelve el stock de la presentacion elegida, no el total', () => {
    const service = makeService();

    // El total es 3 + 0 = 3, pero la variante agotada (11) debe dar 0.
    expect(service.computeAvailable(product, 11)).toBe(0);
    expect(service.computeAvailable(product, 10)).toBe(3);
  });

  it('cae al total cuando no se especifica presentacion', () => {
    const service = makeService();

    expect(service.computeAvailable(product, null)).toBe(3);
    expect(service.computeAvailable(product)).toBe(3);
  });

  it('cae al total cuando la presentacion ya no existe en Dropi', () => {
    const service = makeService();

    // No se bloquea la venta por una variante que Dropi dejo de listar: Dropi
    // decidira al crear la orden.
    expect(service.computeAvailable(product, 999)).toBe(3);
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

describe('DropiProductsService.refreshProductMedia', () => {
  /**
   * Arma un servicio con Prisma, auth y cache mockeados para probar el
   * reemplazo de la media sin tocar Dropi ni la base de datos.
   */
  function makeRefreshService(options: {
    product?: {
      id: string;
      dropiProductId: number | null;
      image: string | null;
    } | null;
    hasToken?: boolean;
    images?: string[];
    videos?: string[];
    fullMediaError?: Error;
  }) {
    const product =
      options.product === undefined
        ? {
            id: 'p1',
            dropiProductId: 241380,
            image: 'https://d39ru7awumhhs2.cloudfront.net/vieja.png',
          }
        : options.product;

    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        update: jest.fn().mockImplementation(
          ({
            data,
          }: {
            data: {
              image?: string;
              gallery?: string[];
              videos?: string[];
            };
          }) => ({
            id: 'p1',
            image: data.image ?? null,
            gallery: data.gallery ?? [],
            videos: data.videos ?? [],
          }),
        ),
      },
    };

    const auth = {
      getOfficialToken: jest
        .fn()
        .mockReturnValue(options.hasToken === false ? null : 'atkn_test'),
    };

    const cache = { invalidate: jest.fn().mockResolvedValue(undefined) };

    const service = new DropiProductsService(
      {} as DropiClient,
      auth as unknown as DropiAuthService,
      prisma as unknown as PrismaService,
      cache as unknown as CatalogCacheService,
    );

    jest.spyOn(service, 'fetchFullProductMedia').mockImplementation(() => {
      if (options.fullMediaError) return Promise.reject(options.fullMediaError);
      return Promise.resolve(options.images ?? []);
    });
    jest
      .spyOn(service, 'fetchProductVideos')
      .mockResolvedValue(options.videos ?? []);

    return { service, prisma, cache };
  }

  it('reemplaza la imagen y la galeria con las URLs actuales de Dropi', async () => {
    const { service, prisma } = makeRefreshService({
      images: [
        'https://d39ru7awumhhs2.cloudfront.net/colombia/products/241380/nueva.png',
        'https://d39ru7awumhhs2.cloudfront.net/colombia/products/241380/extra.jpg',
      ],
      videos: [],
    });

    const result = await service.refreshProductMedia('p1');

    expect(result.image).toBe(
      'https://d39ru7awumhhs2.cloudfront.net/colombia/products/241380/nueva.png',
    );
    expect(result.gallery).toEqual([
      'https://d39ru7awumhhs2.cloudfront.net/colombia/products/241380/nueva.png',
      'https://d39ru7awumhhs2.cloudfront.net/colombia/products/241380/extra.jpg',
    ]);
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } }),
    );
  });

  it('deduplica las imagenes repetidas que devuelve Dropi', async () => {
    const { service } = makeRefreshService({
      images: ['https://cdn/x.png', 'https://cdn/x.png', 'https://cdn/y.png'],
    });

    const result = await service.refreshProductMedia('p1');

    expect(result.gallery).toEqual(['https://cdn/x.png', 'https://cdn/y.png']);
  });

  it('falla con 404 si el producto no existe', async () => {
    const { service } = makeRefreshService({ product: null });

    await expect(service.refreshProductMedia('nope')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('falla con 400 si el producto no viene de Dropi', async () => {
    const { service } = makeRefreshService({
      product: { id: 'p1', dropiProductId: null, image: 'https://x/y.png' },
    });

    await expect(service.refreshProductMedia('p1')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('falla con 503 si no hay DROPI_API_TOKEN en el servidor', async () => {
    const { service } = makeRefreshService({ hasToken: false });

    await expect(service.refreshProductMedia('p1')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('falla con 502 si Dropi no devuelve imagenes ni videos', async () => {
    const { service } = makeRefreshService({ images: [], videos: [] });

    await expect(service.refreshProductMedia('p1')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('conserva la imagen actual si Dropi solo devuelve videos', async () => {
    const { service } = makeRefreshService({
      images: [],
      videos: ['https://cdn/v.mp4'],
    });

    const result = await service.refreshProductMedia('p1');

    expect(result.image).toBe(
      'https://d39ru7awumhhs2.cloudfront.net/vieja.png',
    );
    expect(result.videos).toEqual(['https://cdn/v.mp4']);
  });

  it('invalida la cache del catalogo tras actualizar', async () => {
    const { service, cache } = makeRefreshService({
      images: ['https://cdn/x.png'],
    });

    await service.refreshProductMedia('p1');

    expect(cache.invalidate).toHaveBeenCalledWith('products');
    expect(cache.invalidate).toHaveBeenCalledWith('product');
  });
});
