import { DropiSyncService } from './dropi.sync';
import { DropiProductsService } from './dropi.products';
import { DropiTrackingService } from './dropi.tracking';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';

const LOCAL = [
  { id: 'p1', dropiProductId: 1734566, name: 'Reloj Naviforce', price: 269000 },
  { id: 'p2', dropiProductId: 241380, name: 'Kit Microfono', price: 150000 },
  { id: 'p3', dropiProductId: 291738, name: 'Brasier Copa', price: 18000 },
];

function makeSync(opts: {
  byId: Record<number, any>;
  throwOn?: number[];
  local?: typeof LOCAL;
}) {
  const updates: any[] = [];

  const products = {
    getProductById: jest.fn(async (id: number) => {
      if (opts.throwOn?.includes(id)) throw new Error('timeout');
      return opts.byId[id] ?? null;
    }),
    // Si el sync volviera a paginar el catalogo generico, esto se llamaria.
    fetchCatalog: jest.fn(async () => ({
      isSuccess: true,
      objects: [{ id: 1, name: 'Otro', warehouse_product: [] }],
    })),
    computeStock: jest.fn((p: any) =>
      (p.warehouse_product || []).reduce(
        (s: number, w: any) => s + (w.stock || 0),
        0,
      ),
    ),
  } as unknown as DropiProductsService;

  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue(opts.local ?? LOCAL),
      update: jest.fn(async ({ where, data }: any) => {
        updates.push({ id: where.id, data });
        return {};
      }),
    },
  } as unknown as PrismaService;

  const cache = {
    invalidate: jest.fn().mockResolvedValue(undefined),
  } as unknown as CatalogCacheService;

  const tracking = {
    syncAllPendingOrders: jest.fn(),
    syncDeletedOrders: jest.fn(),
  } as unknown as DropiTrackingService;

  return {
    service: new DropiSyncService(products, prisma, tracking, cache),
    products: products as any,
    updates,
    cache: cache as any,
  };
}

const dropiProduct = (id: number, stock: number, suggested = 0) => ({
  id,
  name: `Producto ${id}`,
  suggested_price: suggested,
  sale_price: 100000,
  warehouse_product: [{ warehouse_id: 1, stock }],
});

describe('DropiSyncService: sincronizacion de stock', () => {
  it('consulta cada producto por su id, no pagina el catalogo generico', async () => {
    const { service, products } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        241380: dropiProduct(241380, 1276),
        291738: dropiProduct(291738, 4),
      },
    });

    await service.syncStock();

    expect(products.getProductById).toHaveBeenCalledTimes(3);
    expect(products.getProductById).toHaveBeenCalledWith(1734566);
    // La regresion: `search_type: 'simple'` sin keywords devuelve el catalogo
    // de la propia tienda del dropshipper, no el del proveedor.
    expect(products.fetchCatalog).not.toHaveBeenCalled();
  });

  it('escribe el stock que devuelve Dropi', async () => {
    const { service, updates } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        241380: dropiProduct(241380, 1276),
        291738: dropiProduct(291738, 4),
      },
    });

    const summary = await service.syncStock();

    expect(summary.updated).toBe(3);
    expect(updates.map((u) => u.data.stock)).toEqual([100, 1276, 4]);
  });

  it('no toca el precio: el sync antes lo sobrescribia con el sugerido', async () => {
    const { service, updates } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 100, 219900) },
    });

    await service.syncStock([1734566]);

    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].data)).toEqual(['stock']);
  });

  it('avisa cuando el precio local quedo bajo el minimo de Dropi', async () => {
    const { service } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 100, 219900) },
      local: [
        { id: 'p1', dropiProductId: 1734566, name: 'Reloj Naviforce', price: 175900 },
      ],
    });

    const summary = await service.syncStock([1734566]);

    // Asi estaba el reloj antes de que lo subieran a mano: 175.900 contra el
    // minimo de 219.900 que exige Dropi.
    expect(summary.priceWarnings).toEqual([
      {
        id: 1734566,
        name: 'Reloj Naviforce',
        local: 175900,
        suggested: 219900,
      },
    ]);
  });

  it('no avisa de precio cuando el local ya supera el minimo', async () => {
    const { service } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 100, 219900) },
    });

    // El reloj esta en 269.000: por encima del minimo.
    const summary = await service.syncStock([1734566]);

    expect(summary.priceWarnings).toEqual([]);
  });

  it('reporta los productos que Dropi no devuelve en vez de ignorarlos', async () => {
    const { service } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 100) },
    });

    const summary = await service.syncStock();

    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(2);
    const missing = summary.details.filter((d) => !d.updated);
    expect(missing).toHaveLength(2);
    expect(missing[0].error).toContain('ausente');
  });

  it('dice el nombre de los saltados, no solo cuantos', async () => {
    // El sintoma real: el logAutomatico decia "2 sin datos en Dropi" y no habia
    // forma de saber cuales sin conectarse a Dropi a mano. Un producto asi, si
    // sigue activo en la web, se vende y su pedido lo rechaza Dropi.
    const { service } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 100) },
    });

    const summary = await service.syncStock();

    expect(summary.skippedNames).toHaveLength(2);
    expect(summary.skippedNames[0]).toContain('Kit Microfono');
    expect(summary.skippedNames[0]).toContain('241380');
    expect(summary.skippedNames[1]).toContain('Brasier Copa');
    expect(summary.skippedNames[0]).toContain('ya no existe');
  });

  it('nombra tambien los que fallaron al leer de Dropi', async () => {
    const { service } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        291738: dropiProduct(291738, 4),
      },
      throwOn: [241380],
    });

    const summary = await service.syncStock();

    expect(summary.errorNames).toHaveLength(1);
    expect(summary.errorNames[0]).toContain('Kit Microfono');
    expect(summary.errorNames[0]).toContain('timeout');
  });

  it('distingue saltado por seleccion de saltado por catalogo', async () => {
    // `skipped` mezcla dos causas muy distintas: no estaba en la seleccion de
    // esta corrida, o Dropi no lo tiene. La segunda es la grave.
    const { service } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 100) },
    });

    const summary = await service.syncStock([1734566]);

    expect(summary.skipped).toBe(2);
    expect(summary.skippedNames).toHaveLength(2);
    expect(summary.skippedNames.join(' ')).toContain('fuera de la seleccion');
  });

  it('sigue con los demas productos si uno falla', async () => {
    const { service, updates } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        291738: dropiProduct(291738, 4),
      },
      throwOn: [241380],
    });

    const summary = await service.syncStock();

    expect(summary.errors).toBe(1);
    expect(summary.updated).toBe(2);
    expect(updates.map((u) => u.id)).toEqual(['p1', 'p3']);
    expect(summary.details.find((d) => d.id === 241380)?.error).toContain(
      'timeout',
    );
  });

  it('invalida la cache de productos cuando cambia el stock', async () => {
    const { service, cache } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        241380: dropiProduct(241380, 1276),
        291738: dropiProduct(291738, 4),
      },
    });

    await service.syncStock();

    expect(cache.invalidate).toHaveBeenCalledWith('products');
    expect(cache.invalidate).toHaveBeenCalledWith('product');
  });
});
