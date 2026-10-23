import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CatalogCacheService } from './catalog-cache.service';
import { RedisService } from '../redis/redis.service';

describe('CatalogCacheService', () => {
  let service: CatalogCacheService;

  const get = jest.fn<Promise<string | null>, [string]>();
  const set = jest.fn<Promise<boolean>, [string, string, number]>();
  const del = jest.fn<Promise<number>, [string]>();
  const delByPattern = jest.fn<Promise<number | undefined>, [string]>();
  const getGeneration = jest.fn<Promise<number | undefined>, [string]>();
  const bumpGeneration = jest.fn<Promise<number | undefined>, [string]>();

  /** Loader que devuelve algo identificable, para saber que entrada se sirvio. */
  const loader = jest.fn().mockResolvedValue({ items: [] });

  /**
   * Espia de los avisos del logger.
   *
   * La cache ahora registra los fallos de Redis en vez de propagarlos, asi que
   * sin esto el test llenaria la consola de avisos en cada caso de error.
   */
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    get.mockResolvedValue(null);
    set.mockResolvedValue(true);
    del.mockResolvedValue(1);
    delByPattern.mockResolvedValue(0);
    // Generacion 0: todavia no se ha invalidado ninguna vez.
    getGeneration.mockResolvedValue(0);
    bumpGeneration.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogCacheService,
        {
          provide: RedisService,
          useValue: {
            get,
            set,
            del,
            delByPattern,
            getGeneration,
            bumpGeneration,
          },
        },
      ],
    }).compile();

    service = module.get<CatalogCacheService>(CatalogCacheService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Todas las claves pedidas, en orden de llegada. */
  const clavesPedidas = (): string[] => get.mock.calls.map(([clave]) => clave);

  /** Clave con la que se pidio la entrada, tal y como fue a Redis. */
  const keyUsed = (): string => get.mock.calls[0][0];

  /**
   * Promesa controlable: el test decide cuando se resuelve.
   *
   * Permite afirmar en que punto exacto esta cada peticion, en vez de
   * esperar un tiempo y confiar en que el orden haya salido como se quiere.
   */
  function diferido<T>() {
    let resolver!: (valor: T) => void;
    let rechazar!: (error: unknown) => void;
    const promesa = new Promise<T>((res, rej) => {
      resolver = res;
      rechazar = rej;
    });
    return { promesa, resolver, rechazar };
  }

  /**
   * Deja correr la cola de microtareas.
   *
   * Cada `await` de una promesa ya resuelta consume un turno de microtareas,
   * asi que este bucle deja avanzar las peticiones hasta el punto que
   * interesa sin depender del reloj.
   */
  async function avanzar(turnos = 12): Promise<void> {
    for (let i = 0; i < turnos; i++) await Promise.resolve();
  }

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
    // El patron se limita a la generacion anterior: la vigente no se borra,
    // porque podria contener una entrada que otro proceso acaba de guardar.
    expect(delByPattern).toHaveBeenCalledWith('cache:products:0:*');
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

  /**
   * La cache es opcional para las lecturas: un fallo de Redis se convierte en
   * un cache miss y la peticion se responde desde la base de datos.
   */
  it('si Redis falla al leer, carga los datos sin cache', async () => {
    get.mockRejectedValueOnce(new Error('Redis no disponible'));

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [] });
    expect(loader).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  /**
   * Guardar en cache es una optimizacion: si falla, los datos ya estan y se
   * devuelven igual.
   */
  it('si Redis falla al guardar, devuelve los datos igualmente', async () => {
    set.mockRejectedValueOnce(new Error('Error al guardar en Redis'));

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [] });
    expect(loader).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  /**
   * `RedisService.set` no lanza: devuelve `false` cuando no logra guardar.
   * Esa es la via real de fallo al guardar, y tambien debe acabar en un
   * aviso sin romper la lectura.
   */
  it('si Redis no confirma el guardado, devuelve los datos igualmente', async () => {
    set.mockResolvedValueOnce(false);

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [] });
    expect(loader).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  /**
   * Una entrada corrupta que no se puede borrar tampoco puede dejar la
   * lectura sin resolver.
   */
  it('si la entrada corrupta no se puede borrar, igual recarga los datos', async () => {
    get.mockResolvedValue('{no es json');
    del.mockRejectedValueOnce(new Error('Redis no disponible'));

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [] });
    expect(loader).toHaveBeenCalled();
  });

  /**
   * Invalidar es un paso de la escritura en la base de datos. Si Redis falla,
   * la escritura no debe caer: se avisa y se sigue.
   */
  it('si Redis falla al invalidar, no rompe la escritura', async () => {
    delByPattern.mockRejectedValueOnce(new Error('Error al invalidar Redis'));

    await expect(service.invalidate('products')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });

  /**
   * Redis no disponible: `delByPattern` devuelve `undefined` porque no se pudo
   * ni comprobar ni borrar. Hay que avisar, porque la cache puede estar
   * sirviendo datos viejos y nadie se ha enterado.
   */
  it('si Redis no esta disponible, avisa de que no se pudo invalidar', async () => {
    delByPattern.mockResolvedValueOnce(undefined);

    await expect(service.invalidate('products')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });

  /**
   * Redis respondio y simplemente no habia nada que borrar: no es un fallo y
   * no debe generar ningun aviso. Es justo la distincion que allowa
   * `undefined` frente a `0`.
   */
  it('si Redis responde y no hay nada que borrar, no avisa de un fallo', async () => {
    delByPattern.mockResolvedValueOnce(0);

    await expect(service.invalidate('products')).resolves.toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * Un fallo del loader es un fallo de PostgreSQL: ahi no hay nada que
   * servir, asi que el error tiene que llegar al controlador.
   */
  it('propaga el error del loader (una caida de PostgreSQL no se oculta)', async () => {
    const loaderFallido = jest
      .fn()
      .mockRejectedValue(new Error('PostgreSQL no responde'));

    await expect(
      service.remember('products', ['x'], loaderFallido),
    ).rejects.toThrow('PostgreSQL no responde');
  });

  /**
   * Si Redis esta caido, todas las peticiones fallan por el mismo motivo. Con
   * un aviso por fallo el log se llena de miles de lineas identicas.
   */
  it('no repite el aviso de cache mas de una vez cada 30 segundos', async () => {
    get.mockRejectedValue(new Error('Redis no disponible'));

    await service.remember('products', ['x'], loader);
    await service.remember('products', ['y'], loader);
    await service.remember('products', ['z'], loader);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  /**
   * Una carga terminada no bloquea la siguiente peticion: si la entrada del
   * mapa no se quitara, las peticiones siguientes esperarian a una carga ya
   * terminada y devolverian siempre el mismo valor viejo.
   */
  it('una carga terminada no bloquea la siguiente peticion', async () => {
    const consultas = jest.fn().mockResolvedValue({ items: [] });

    await service.remember('products', ['x'], consultas);
    await service.remember('products', ['x'], consultas);

    expect(consultas).toHaveBeenCalledTimes(2);
  });

  /**
   * Si la carga compartida falla, todas las peticiones que la esperaban
   * reciben el mismo error y el loader no se vuelve a llamar: reintentar
   * contra una base de datos caida solo genera mas carga.
   */
  it('si la carga compartida falla, todas reciben el error y el loader se llama una vez', async () => {
    const consultas = jest
      .fn()
      .mockRejectedValue(new Error('PostgreSQL no responde'));

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.remember('products', ['x'], consultas),
      ),
    );

    expect(consultas).toHaveBeenCalledTimes(1);
    expect(resultados.every((r) => r.status === 'rejected')).toBe(true);
  });

  /**
   * Single-flight: 10 visitantes piden la misma consulta con la cache vacia.
   * Sin el, cada uno lanza su propia consulta a PostgreSQL. Con el, todos
   * esperan a la misma carga.
   */
  it('comparte la carga cuando varias solicitudes piden la misma clave', async () => {
    const control = diferido<{ items: number[] }>();
    const consultas = jest.fn(() => control.promesa);

    const pendientes = Array.from({ length: 10 }, () =>
      service.remember('products', ['misma-consulta'], consultas),
    );

    // Se deja que todas las peticiones lleguen al loader. Sin resolver la
    // promesa controlada, las que llegaran despues se encontrarian con la
    // carga ya terminada y podrian arrancar la suya.
    await avanzar();

    expect(consultas).toHaveBeenCalledTimes(1);

    control.resolver({ items: [1, 2, 3] });
    const resultados = await Promise.all(pendientes);

    expect(resultados).toHaveLength(10);
    expect(
      resultados.every(
        (resultado) =>
          JSON.stringify(resultado) === JSON.stringify({ items: [1, 2, 3] }),
      ),
    ).toBe(true);
  });

  /* ------------------------------------------------------------------
   * Generaciones: la invalidacion logica
   * ------------------------------------------------------------------ */

  it('la clave incluye la generacion vigente', async () => {
    getGeneration.mockResolvedValue(7);

    await service.remember('products', ['x'], loader);

    expect(keyUsed()).toMatch(/^cache:products:7:[0-9a-f]{64}$/);
  });

  it('invalidate sube la generacion del scope', async () => {
    bumpGeneration.mockResolvedValue(4);

    await service.invalidate('products');

    expect(bumpGeneration).toHaveBeenCalledWith('products');
  });

  it('una consulta que empezo antes de la invalidacion no escribe en la generacion nueva', async () => {
    const control = diferido<{ items: number[] }>();
    const consultas = jest.fn(() => control.promesa);

    // Generacion 0 cuando empieza la consulta.
    getGeneration.mockResolvedValue(0);

    const pendiente = service.remember('products', ['x'], consultas);
    await avanzar();

    expect(consultas).toHaveBeenCalledTimes(1);

    // Se invalida mientras la consulta sigue en curso: la generacion pasa a 1.
    getGeneration.mockResolvedValue(1);

    control.resolver({ items: [1] });
    const resultado = await pendiente;

    // La peticion que ya estaba esperando recibe su resultado...
    expect(resultado).toEqual({ items: [1] });
    // ...pero ese resultado viejo no se guarda en la generacion nueva.
    expect(set).not.toHaveBeenCalled();
  });

  it('no sirve una entrada cacheada si la generacion cambio mientras se leia', async () => {
    // La lectura de la generacion devuelve 0, pero al comprobar de nuevo ya
    // es 1: la entrada cacheada es de una generacion vieja.
    getGeneration.mockResolvedValueOnce(0).mockResolvedValue(1);
    get.mockResolvedValue(JSON.stringify({ items: ['viejo'] }));

    const consultas = jest.fn().mockResolvedValue({ items: ['nuevo'] });

    const resultado = await service.remember('products', ['x'], consultas);

    // No se sirve lo viejo: se recarga.
    expect(resultado).toEqual({ items: ['nuevo'] });
    expect(consultas).toHaveBeenCalled();
  });

  it('despues de invalidar, la recarga se guarda en la generacion nueva', async () => {
    getGeneration.mockResolvedValueOnce(0).mockResolvedValue(1);
    get.mockResolvedValue(JSON.stringify({ items: ['viejo'] }));
    const consultas = jest.fn().mockResolvedValue({ items: ['nuevo'] });

    await service.remember('products', ['x'], consultas);

    // La recarga se guarda con la generacion 1, no con la 0: la entrada vieja
    // no puede volver a servirse.
    expect(consultas).toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    const claveGuardada = set.mock.calls[0][0];
    expect(claveGuardada).toMatch(/^cache:products:1:[0-9a-f]{64}$/);
  });

  it('si Redis no esta disponible, se responde desde la base de datos sin cache', async () => {
    // No se puede saber la generacion: no hay cache que leer ni en la que
    // escribir, pero la lectura no se rompe.
    getGeneration.mockResolvedValue(undefined);

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [] });
    expect(loader).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('si no se puede saber la generacion, no se confunde con la generacion 0', async () => {
    // Redis no disponible durante la carga: la generacion deja de ser
    // conocido y el resultado no se guarda. Con un `0` por defecto se
    // guardaria en una generacion que podria estar obsoleta.
    getGeneration.mockResolvedValueOnce(0).mockResolvedValue(undefined);

    const resultado = await service.remember('products', ['x'], loader);

    expect(resultado).toEqual({ items: [] });
    expect(set).not.toHaveBeenCalled();
  });

  it('si la generacion no se puede subir, la invalidacion avisa pero no rompe', async () => {
    bumpGeneration.mockResolvedValue(undefined);

    await expect(service.invalidate('products')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    expect(delByPattern).not.toHaveBeenCalled();
  });

  it('si el borrado de la generacion anterior falla, la invalidacion ya surtio efecto', async () => {
    bumpGeneration.mockResolvedValue(2);
    delByPattern.mockResolvedValue(undefined);

    await expect(service.invalidate('products')).resolves.toBeUndefined();

    // La generacion ya subio: las peticiones siguientes usan claves nuevas.
    expect(bumpGeneration).toHaveBeenCalledWith('products');
    expect(warn).toHaveBeenCalled();
  });
});
