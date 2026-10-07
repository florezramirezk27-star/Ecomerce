import { DropiProductsService } from './dropi.products';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';

/**
 * Lo que cubre este archivo: el producto de Dropi solo se puede importar una
 * vez. La defensa es doble y aqui se prueba la del codigo (el indice unico de
 * `dropiProductId` vive en schema.prisma y en la migracion, no se puede
 * ejercitar sin la BD):
 *
 *  - `importProduct` se niega con 409 antes de gastar una llamada a Dropi.
 *  - `fetchCatalog` marca `imported` para que la UI bloquee el boton.
 */
describe('DropiProductsService — importar una sola vez', () => {
  let service: DropiProductsService;
  let client: { request: jest.Mock };
  let prisma: {
    product: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = { request: jest.fn() };
    prisma = {
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new DropiProductsService(
      client as unknown as DropiClient,
      {
        getToken: jest.fn().mockResolvedValue('token'),
      } as unknown as DropiAuthService,
      prisma as unknown as PrismaService,
      { invalidate: jest.fn() } as unknown as CatalogCacheService,
    );
  });

  it('devuelve 409 y no llama a Dropi cuando el producto ya esta importado', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-ya-importado',
      name: 'Reloj Naviforce',
    });

    await expect(service.importProduct(1734566)).rejects.toMatchObject({
      status: 409,
    });

    expect(client.request).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('pasa a Dropi cuando el producto todavia no esta en la tienda', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    client.request.mockResolvedValue({
      statusCode: 200,
      data: JSON.stringify({ is_succesfull: false }),
    });

    await expect(service.importProduct(999)).rejects.toThrow(
      'no encontrado en Dropi',
    );

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dropiProductId: 999 } }),
    );
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('marca en el catalogo los productos que ya estan en la tienda', async () => {
    client.request.mockResolvedValue({
      statusCode: 200,
      data: JSON.stringify({
        is_succesfull: true,
        data: { objects: [{ id: 111 }, { id: 222 }, { id: 333 }] },
      }),
    });
    prisma.product.findMany.mockResolvedValue([{ dropiProductId: 222 }]);

    const res = await service.fetchCatalog({ pageSize: 50 });

    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(res.objects).toEqual([
      { id: 111, imported: false },
      { id: 222, imported: true },
      { id: 333, imported: false },
    ]);
  });

  it('no consulta la tienda si el catalogo vino vacio', async () => {
    client.request.mockResolvedValue({
      statusCode: 200,
      data: JSON.stringify({ is_succesfull: true, data: { objects: [] } }),
    });

    const res = await service.fetchCatalog({ pageSize: 50 });

    expect(res.objects).toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});
