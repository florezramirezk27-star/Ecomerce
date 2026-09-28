import { Test, TestingModule } from '@nestjs/testing';

import { CatalogCacheService } from './catalog-cache.service';
import { RedisService } from '../redis/redis.service';

describe('CatalogCacheService', () => {
  let service: CatalogCacheService;

  const get = jest.fn<Promise<string | null>, [string]>();
  const set = jest.fn<Promise<boolean>, [string, string, number]>();
  const del = jest.fn<Promise<number>, [string]>();
  const delByPattern = jest.fn<Promise<number>, [string]>();

  /** Loader que devuelve algo identificable, para saber que entrada se sirvio. */
  const loader = jest.fn().mockResolvedValue({ items: [] });

  beforeEach(async () => {
    jest.clearAllMocks();
    get.mockResolvedValue(null);
    set.mockResolvedValue(true);
    del.mockResolvedValue(1);
    delByPattern.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogCacheService,
        {
          provide: RedisService,
          useValue: { get, set, del, delByPattern },
        },
      ],
    }).compile();

    service = module.get<CatalogCacheService>(CatalogCacheService);
  });

  /** Todas las claves pedidas, en orden de llegada. */
  const clavesPedidas = (): string[] => get.mock.calls.map(([clave]) => clave);

  /** Clave con la que se pidio la entrada, tal y como fue a Redis. */
  const keyUsed = (): string => get.mock.calls[0][0];

  it('no confunde una busqueda con su categoria', async () => {
    // Estas dos consultas son distintas y antes compartian clave:
    //   cache:products:zapatos:1
    await service.remember('products', ['zapatos', 1], loader);
    await service.remember('products', ['zapatos:1', undefined], loader);

    const claves = clavesPedidas();
    expect(claves[0]).not.toBe(claves[1]);
  });

  it('la misma consulta con distinta categoria usa claves distintas', async () => {
    await service.remember('products', ['zapatos', 1], loader);
    await service.remember('products', ['zapatos', 2], loader);

    const claves = clavesPedidas();
    expect(claves[0]).not.toBe(claves[1]);
  });

  it('la misma consulta repetida usa la misma clave', async () => {
    await service.remember('products', ['zapatos', 1, true], loader);
    await service.remember('products', ['zapatos', 1, true], loader);

    const claves = clavesPedidas();
    expect(claves[0]).toBe(claves[1]);
  });

  it('distingue undefined, null y la cadena "undefined"', async () => {
    await service.remember('product', [undefined], loader);
    await service.remember('product', [null], loader);
    await service.remember('product', ['undefined'], loader);

    expect(new Set(clavesPedidas()).size).toBe(3);
  });

  it('un * en la busqueda no puede ampliar el patron de invalidate', async () => {
    // Con concatenacion directa, la busqueda "*" generaba
    // `cache:products:*:...` y `invalidate('products')` borraba de mas.
    await service.remember('products', ['*'], loader);
    await service.invalidate('products');

    const clave = keyUsed();
    expect(clave).not.toContain('*');
    // El scope sigue en claro para que el barrer por patron lo encuentre.
    expect(clave.startsWith('cache:products:')).toBe(true);
    expect(delByPattern).toHaveBeenCalledWith('cache:products:*');
  });

  it('acota la longitud de la clave ante una busqueda enorme', async () => {
    await service.remember('products', ['a'.repeat(10_000)], loader);

    expect(keyUsed().length).toBeLessThan(120);
  });

  it('devuelve el valor cacheado sin volver a cargar', async () => {
    get.mockResolvedValue(JSON.stringify({ items: [1] }));

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [1] });
    expect(loader).not.toHaveBeenCalled();
  });

  it('carga y guarda cuando no hay cache', async () => {
    const resultado = await service.remember('products', ['x'], loader, 30);

    expect(resultado).toEqual({ items: [] });
    expect(set).toHaveBeenCalledWith(
      keyUsed(),
      JSON.stringify({ items: [] }),
      30,
    );
  });

  it('descarta el cache corrupto y vuelve a cargar', async () => {
    get.mockResolvedValue('{no es json');

    await service.remember('products', ['x'], loader);

    expect(del).toHaveBeenCalledWith(keyUsed());
    expect(loader).toHaveBeenCalled();
  });
});
