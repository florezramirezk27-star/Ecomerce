import { DropiSyncService } from './dropi.sync';
import { DropiProductsService } from './dropi.products';
import { DropiTrackingService } from './dropi.tracking';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';
import { Prisma } from '@prisma/client';

const LOCAL = [
  { id: 'p1', dropiProductId: 1734566, name: 'Reloj Naviforce', price: 269000 },
  { id: 'p2', dropiProductId: 241380, name: 'Kit Microfono', price: 150000 },
  { id: 'p3', dropiProductId: 291738, name: 'Brasier Copa', price: 18000 },
];

/** Stock por bodega como lo devuelve Dropi (solo lo que sumamos). */
interface DropiWarehouseStock {
  warehouse_id?: number;
  stock?: number;
}

/** Variante de un producto VARIABLE, como la devuelve Dropi. */
interface DropiVariationFixture {
  id: number;
  stock?: number;
  attribute_values?: Array<{ value?: string }>;
}

/** Producto de Dropi, tal como lo usa el sync (solo los campos que toca). */
interface DropiProduct {
  id: number;
  name: string;
  type?: string;
  suggested_price?: number;
  sale_price?: number;
  warehouse_product?: DropiWarehouseStock[];
  variations?: DropiVariationFixture[];
}

/** Fila local escrita por el sync: id del producto y lo que se actualiza. */
interface ProductUpdate {
  id: string;
  data: { stock: number; variations?: unknown };
}

/**
 * Doble del catalogo: una instancia REAL del servicio con solo las salidas a
 * Dropi espiadas. Asi `computeStock` y `buildVariations` son los del codigo de
 * produccion y no una copia que se queda mintiendo cuando cambie la regla de
 * stock o de presentaciones.
 */
function makeSync(opts: {
  byId: Record<number, DropiProduct>;
  throwOn?: number[];
  local?: Array<{
    id: string;
    dropiProductId: number;
    name: string;
    price: number;
    stock?: number;
    variations?: unknown;
  }>;
}) {
  const updates: ProductUpdate[] = [];

  const products = new DropiProductsService(
    {} as DropiClient,
    {} as DropiAuthService,
    {} as PrismaService,
    {} as CatalogCacheService,
  );
  const getProductById = jest
    .spyOn(products, 'getProductById')
    .mockImplementation((id: number) => {
      if (opts.throwOn?.includes(id)) {
        return Promise.reject(new Error('timeout'));
      }
      return Promise.resolve(opts.byId[id] ?? null);
    });
  // Si el sync volviera a paginar el catalogo generico, esto se llamaria.
  const fetchCatalog = jest.spyOn(products, 'fetchCatalog').mockResolvedValue({
    isSuccess: true,
    objects: [{ id: 1, name: 'Otro', warehouse_product: [] }],
  });

  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue(opts.local ?? LOCAL),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { stock: number };
        }) => {
          updates.push({ id: where.id, data });
          return {};
        },
      ),
    },
  } as unknown as PrismaService;

  const cache = {
    invalidate: jest.fn().mockResolvedValue(undefined),
  };

  const tracking = {
    syncAllPendingOrders: jest.fn(),
    syncDeletedOrders: jest.fn(),
  } as unknown as DropiTrackingService;

  return {
    service: new DropiSyncService(
      products,
      prisma,
      tracking,
      cache as unknown as CatalogCacheService,
    ),
    products,
    getProductById,
    fetchCatalog,
    updates,
    cache,
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
    const { service, getProductById, fetchCatalog } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        241380: dropiProduct(241380, 1276),
        291738: dropiProduct(291738, 4),
      },
    });

    await service.syncStock();

    expect(getProductById).toHaveBeenCalledTimes(3);
    expect(getProductById).toHaveBeenCalledWith(1734566);
    // La regresion: `search_type: 'simple'` sin keywords devuelve el catalogo
    // de la propia tienda del dropshipper, no el del proveedor.
    expect(fetchCatalog).not.toHaveBeenCalled();
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
        {
          id: 'p1',
          dropiProductId: 1734566,
          name: 'Reloj Naviforce',
          price: 175900,
        },
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

  it('no reescribe ni cuenta como actualizado lo que Dropi dejo igual', async () => {
    // Antes el sync hacia un UPDATE por producto sin comparar: 88 escrituras
    // por corrida aunque el stock fuera el mismo, y el panel reportaba todos
    // como "actualizados". Ahora solo se toca lo que cambio.
    const { service, updates, cache } = makeSync({
      byId: {
        1734566: dropiProduct(1734566, 100),
        241380: dropiProduct(241380, 1276),
        291738: dropiProduct(291738, 4),
      },
      local: [
        {
          id: 'p1',
          dropiProductId: 1734566,
          name: 'Reloj Naviforce',
          price: 269000,
          stock: 100, // igual al de Dropi
        },
        {
          id: 'p2',
          dropiProductId: 241380,
          name: 'Kit Microfono',
          price: 150000,
          stock: 1270, // distinto: 6 de diferencia
        },
        {
          id: 'p3',
          dropiProductId: 291738,
          name: 'Brasier Copa',
          price: 18000,
          stock: 4, // igual
        },
      ],
    });

    const summary = await service.syncStock();

    expect(summary.checked).toBe(3);
    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBe(2);
    expect(updates.map((u) => u.id)).toEqual(['p2']);
    expect(updates[0].data.stock).toBe(1276);
    // Solo hubo un cambio: la cache igual se invalida una vez.
    expect(cache.invalidate).toHaveBeenCalledWith('products');
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

  it('guarda las presentaciones de un producto VARIABLE', async () => {
    // El sync es el unico que ve el catalogo cambio a cambio: si no guardara las
    // variaciones, la ficha no tendria selector y la orden saldria sin
    // `variation_id`, que es justo lo que Dropi rechaza con "las existencias han
    // variado".
    const { service, updates } = makeSync({
      byId: {
        1734566: {
          ...dropiProduct(1734566, 3),
          type: 'VARIABLE',
          variations: [
            { id: 10, stock: 3, attribute_values: [{ value: 'Talla M' }] },
            { id: 11, stock: 0, attribute_values: [{ value: 'Talla G' }] },
          ],
        },
      },
      local: [
        {
          id: 'p1',
          dropiProductId: 1734566,
          name: 'Camiseta',
          price: 80000,
          stock: 0,
        },
      ],
    });

    const summary = await service.syncStock([1734566]);

    expect(summary.updated).toBe(1);
    expect(updates[0].data.stock).toBe(3);
    expect(updates[0].data.variations).toEqual([
      { id: 10, name: 'Talla M', stock: 3 },
      { id: 11, name: 'Talla G', stock: 0 },
    ]);
  });

  it('no reescribe cuando ni el stock ni las presentaciones cambiaron', async () => {
    const { service, updates } = makeSync({
      byId: {
        1734566: {
          ...dropiProduct(1734566, 3),
          type: 'VARIABLE',
          variations: [
            { id: 10, stock: 3, attribute_values: [{ value: 'Talla M' }] },
          ],
        },
      },
      local: [
        {
          id: 'p1',
          dropiProductId: 1734566,
          name: 'Camiseta',
          price: 80000,
          stock: 3,
          // Misma forma y orden que `buildVariations`: la comparacion es por
          // `JSON.stringify`.
          variations: [{ id: 10, name: 'Talla M', stock: 3 }],
        },
      ],
    });

    const summary = await service.syncStock([1734566]);

    expect(summary.unchanged).toBe(1);
    expect(summary.updated).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('limpia las presentaciones cuando Dropi deja de tener variantes', async () => {
    const { service, updates } = makeSync({
      byId: { 1734566: dropiProduct(1734566, 5) },
      local: [
        {
          id: 'p1',
          dropiProductId: 1734566,
          name: 'Camiseta',
          price: 80000,
          stock: 3,
          variations: [{ id: 10, name: 'Talla M', stock: 3 }],
        },
      ],
    });

    const summary = await service.syncStock([1734566]);

    expect(summary.updated).toBe(1);
    // `DbNull` y no `[]`: el producto volvio a ser simple y la ficha no debe
    // mostrar un selector vacio.
    expect(updates[0].data.variations).toBe(Prisma.DbNull);
  });
});
