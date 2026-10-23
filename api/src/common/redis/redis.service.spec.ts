import type Redis from 'ioredis';

import { RedisService } from './redis.service';

/**
 * Pruebas de `RedisService.delByPattern`.
 *
 * Este metodo es el que decide si una invalidacion de cache se puede dar por
 * buena. Antes devolvia `0` tanto si Redis no estaba disponible como si no
 * habia nada que borrar, y el llamador no podia distinguirlo: se creia que la
 * invalidacion habia funcionado y la cache seguia sirviendo datos viejos.
 */
describe('RedisService.delByPattern', () => {
  let service: RedisService;
  let scan: jest.Mock;
  let del: jest.Mock;
  let redisUrlOriginal: string | undefined;

  /** Cliente de Redis falso, con lo unico que el metodo usa. */
  function clienteFalso(estado: string) {
    return {
      status: estado,
      scan,
      del,
      on: jest.fn(),
    } as unknown as Redis;
  }

  /** Sustituye el cliente real del servicio por el falso. */
  function usarCliente(estado: string) {
    (service as unknown as { client: unknown }).client = clienteFalso(estado);
  }

  beforeEach(() => {
    // El constructor lee REDIS_URL del entorno: sin esto crearia un cliente
    // real de ioredis que intentaria conectar contra el Redis de verdad.
    redisUrlOriginal = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    scan = jest.fn();
    del = jest.fn();

    service = new RedisService();
  });

  afterEach(() => {
    if (redisUrlOriginal === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = redisUrlOriginal;
  });

  it('devuelve undefined si Redis no esta configurado', async () => {
    // Sin URL no hay cliente: `ready()` devuelve null.
    const resultado = await service.delByPattern('cache:products:*');

    expect(resultado).toBeUndefined();
    expect(del).not.toHaveBeenCalled();
  });

  it('devuelve undefined si Redis esta caido', async () => {
    usarCliente('connecting');

    const resultado = await service.delByPattern('cache:products:*');

    expect(resultado).toBeUndefined();
    expect(scan).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('devuelve 0 si Redis responde y no hay claves que borrar', async () => {
    usarCliente('ready');
    scan.mockResolvedValue(['0', []]);

    const resultado = await service.delByPattern('cache:products:*');

    expect(resultado).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it('devuelve cuantas claves borro', async () => {
    usarCliente('ready');
    scan.mockResolvedValue(['0', ['cache:products:a', 'cache:products:b']]);
    del.mockResolvedValue(2);

    const resultado = await service.delByPattern('cache:products:*');

    expect(resultado).toBe(2);
    expect(del).toHaveBeenCalledWith('cache:products:a', 'cache:products:b');
  });

  it('recorre todas las paginas del SCAN antes de borrar', async () => {
    usarCliente('ready');
    // SCAN devuelve paginas: la primera con cursor distinto de '0'.
    scan
      .mockResolvedValueOnce(['7', ['cache:products:a']])
      .mockResolvedValueOnce(['0', ['cache:products:b']]);
    del.mockResolvedValue(2);

    const resultado = await service.delByPattern('cache:products:*');

    expect(scan).toHaveBeenCalledTimes(2);
    expect(resultado).toBe(2);
    expect(del).toHaveBeenCalledWith('cache:products:a', 'cache:products:b');
  });

  it('propaga el error si el borrado falla', async () => {
    // `del` usa `safeOrThrow`: aqui no hay nada que servir, el error tiene
    // que llegar al llamador para que decida.
    usarCliente('ready');
    scan.mockResolvedValue(['0', ['cache:products:a']]);
    del.mockRejectedValue(new Error('Redis del fallo'));

    await expect(service.delByPattern('cache:products:*')).rejects.toThrow(
      'Redis del fallo',
    );
  });
});

/**
 * Pruebas de las generaciones de cache.
 *
 * La generacion es el mecanismo de invalidacion logica: al subirla, las
 * peticiones siguientes usan claves distintas y no pueden leer las entradas
 * de la generacion anterior.
 */
describe('RedisService: generaciones de cache', () => {
  let service: RedisService;
  let get: jest.Mock;
  let incr: jest.Mock;
  let redisUrlOriginal: string | undefined;

  function clienteFalso(estado: string) {
    return { status: estado, get, incr, on: jest.fn() } as unknown as Redis;
  }

  function usarCliente(estado: string) {
    (service as unknown as { client: unknown }).client = clienteFalso(estado);
  }

  beforeEach(() => {
    redisUrlOriginal = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    get = jest.fn();
    incr = jest.fn();

    service = new RedisService();
  });

  afterEach(() => {
    if (redisUrlOriginal === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = redisUrlOriginal;
  });

  it('devuelve 0 cuando el scope todavia no tiene generacion', async () => {
    usarCliente('ready');
    get.mockResolvedValue(null);

    const generacion = await service.getGeneration('products');

    // 0 es "aun no se ha invalidado ninguna vez". No es lo mismo que
    // `undefined`, que significa "no se puede saber".
    expect(generacion).toBe(0);
    expect(get).toHaveBeenCalledWith('cachegen:products');
  });

  it('devuelve la generacion vigente', async () => {
    usarCliente('ready');
    get.mockResolvedValue('7');

    const generacion = await service.getGeneration('products');

    expect(generacion).toBe(7);
  });

  it('devuelve undefined si Redis no esta configurado', async () => {
    const generacion = await service.getGeneration('products');

    expect(generacion).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('devuelve undefined si Redis esta caido', async () => {
    usarCliente('connecting');

    const generacion = await service.getGeneration('products');

    expect(generacion).toBeUndefined();
  });

  it('devuelve undefined si el comando falla, sin tomarlo por una generacion valida', async () => {
    usarCliente('ready');
    get.mockRejectedValue(new Error('Redis get fallo'));

    const generacion = await service.getGeneration('products');

    // Un error no es "generacion 0": seria usar claves de una generacion
    // antigua que podria seguir viva.
    expect(generacion).toBeUndefined();
  });

  it('devuelve undefined si el valor guardado no es un numero', async () => {
    usarCliente('ready');
    get.mockResolvedValue('no-es-un-numero');

    const generacion = await service.getGeneration('products');

    expect(generacion).toBeUndefined();
  });

  it('incrementa la generacion y devuelve la nueva', async () => {
    usarCliente('ready');
    incr.mockResolvedValue(4);

    const generacion = await service.bumpGeneration('products');

    expect(generacion).toBe(4);
    expect(incr).toHaveBeenCalledWith('cachegen:products');
  });

  it('devuelve undefined si no se puede incrementar', async () => {
    usarCliente('connecting');

    const generacion = await service.bumpGeneration('products');

    expect(generacion).toBeUndefined();
    expect(incr).not.toHaveBeenCalled();
  });

  it('devuelve undefined si el incremento falla', async () => {
    usarCliente('ready');
    incr.mockRejectedValue(new Error('Redis incr fallo'));

    const generacion = await service.bumpGeneration('products');

    expect(generacion).toBeUndefined();
  });

  it('la clave de generacion no esta bajo el prefijo que se barre por patron', async () => {
    usarCliente('ready');
    get.mockResolvedValue(null);

    await service.getGeneration('products');

    // El barrido de un scope usa `cache:<scope>:*`. Si la generacion viviera
    // debajo de ese patron, se borraria con el y volveria a 0, reviveiendo
    // las claves de la generacion 0.
    expect(get).toHaveBeenCalledWith('cachegen:products');
    expect('cachegen:products'.startsWith('cache:products:')).toBe(false);
  });
});

/**
 * Pruebas de `RedisService.getAndDelete`.
 *
 * Este metodo consume un codigo de un solo uso. Antes hacia GETDEL y, si no
 * habia valor, caia a un `get` seguido de un `del`: dos operaciones que no
 * son atomicas, asi que dos peticiones simultaneas podian leer el mismo
 * codigo y canjearlo dos veces.
 */
describe('RedisService.getAndDelete', () => {
  let service: RedisService;
  let getdel: jest.Mock;
  let get: jest.Mock;
  let del: jest.Mock;
  let redisUrlOriginal: string | undefined;

  function clienteFalso(estado: string) {
    return {
      status: estado,
      getdel,
      get,
      del,
      on: jest.fn(),
    } as unknown as Redis;
  }

  function usarCliente(estado: string) {
    (service as unknown as { client: unknown }).client = clienteFalso(estado);
  }

  beforeEach(() => {
    redisUrlOriginal = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    getdel = jest.fn();
    get = jest.fn();
    del = jest.fn();

    service = new RedisService();
  });

  afterEach(() => {
    if (redisUrlOriginal === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = redisUrlOriginal;
  });

  it('consume el valor con GETDEL', async () => {
    usarCliente('ready');
    getdel.mockResolvedValue('el-codigo');

    const valor = await service.getAndDelete('auth:exchange:abc');

    expect(valor).toBe('el-codigo');
    expect(getdel).toHaveBeenCalledWith('auth:exchange:abc');
  });

  it('devuelve null si la clave no existe, sin tocar nada mas', async () => {
    usarCliente('ready');
    getdel.mockResolvedValue(null);

    const valor = await service.getAndDelete('auth:exchange:abc');

    expect(valor).toBeNull();
    // El repliegue a get+del era justo lo que se queria quitar: no es
    // atomico y permitia canjear un codigo dos veces.
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('propaga el error si el comando falla', async () => {
    usarCliente('ready');
    getdel.mockRejectedValue(new Error('Redis getdel fallo'));

    await expect(service.getAndDelete('auth:exchange:abc')).rejects.toThrow(
      'Redis getdel fallo',
    );
  });

  it('propaga el error si Redis no esta disponible', async () => {
    usarCliente('connecting');

    await expect(service.getAndDelete('auth:exchange:abc')).rejects.toThrow(
      'Redis no disponible',
    );
  });
});
