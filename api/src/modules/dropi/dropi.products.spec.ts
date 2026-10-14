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
