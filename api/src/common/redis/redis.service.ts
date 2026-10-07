import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Minimo intervalo entre dos logs consecutivos de "Redis sigue caido". */
const LOG_THROTTLE_MS = 30_000;

/**
 * Extrae un mensaje util de un error desconocido.
 *
 * Narrowing sobre `unknown` cubre tanto un `Error` real como los strings y
 * objetos sueltos que lanza ioredis en algunos comandos, sin recurrir a `any`
 * (que dispara `no-unsafe-member-access`).
 */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/** Cliente Redis compartido por los servicios de produccion. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: Redis;

  /**
   * Redis caido no debe generar una linea de log por request ni por reintento.
   * Con trafico alto eso son miles de lineas por segundo y el proceso se
   * dedicaria mas a escribir logs que a servir. Se registra la caida una vez y
   * se reintenta escribir cada `LOG_THROTTLE_MS`.
   */
  private lastFailureLog = 0;
  private downSince: number | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      // Sin esto, un comando emitido mientras Redis esta caido se encola y
      // espera a que ioredis reconecte. Cada request pagaba ese timeout, y con
      // 1000 concurrentes eso agota el event loop entero. Con offline queue
      // desactivado el comando falla de inmediato y el llamador usa su
      // fallback contra PostgreSQL.
      enableOfflineQueue: false,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT ?? 5000),
      // Backoff exponencial con tope. El default de ioredis reconecta cada
      // 1s-2s sin parar, asi que un Redis caido se convierte en un bucle
      // eterno de reintentos contra un endpoint muerto.
      retryStrategy: (attempt) => Math.min(attempt * 500, 30_000),
      tls: url.startsWith('rediss://') ? {} : undefined,
    });

    this.client.on('error', (error) => this.noteFailure(error));
    this.client.on('ready', () => this.noteReady());
  }

  private noteFailure(error: Error) {
    const now = Date.now();
    if (this.downSince === null) {
      this.downSince = now;
      this.logger.warn(
        `Redis no disponible, se degrada a PostgreSQL: ${error.message}`,
      );
      return;
    }

    if (now - this.lastFailureLog >= LOG_THROTTLE_MS) {
      this.lastFailureLog = now;
      this.logger.warn(`Redis sigue caido: ${error.message}`);
    }
  }

  private noteReady() {
    if (this.downSince === null) return;

    const downFor = Math.round((Date.now() - this.downSince) / 1000);
    this.downSince = null;
    this.lastFailureLog = 0;
    this.logger.log(`Redis recuperada tras ${downFor}s sin responder`);
  }

  async ping(): Promise<boolean> {
    // Pasa por `ready()` para respetar el corte de circuit breaker: si la
    // conexion esta reintentando, se responde false de inmediato en vez de
    // esperar a que ioredis recupere el socket.
    const client = await this.ready();
    if (!client) return false;
    try {
      return (await client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** True when a REDIS_URL is configured and the client was constructed. */
  isEnabled(): boolean {
    return Boolean(this.client);
  }

  /** Estado de la conexion, para exponerlo en /health y /ready. */
  status(): 'disabled' | 'ready' | 'down' {
    if (!this.client) return 'disabled';
    return this.client.status === 'ready' ? 'ready' : 'down';
  }

  /**
   * Resuelve un cliente conectado, o null cuando Redis no esta configurado o la
   * conexion esta caida. Los llamadores siempre deben traer un fallback que no
   * dependa de Redis.
   *
   * Devuelve null de inmediato si la conexion esta reintentando: esperar a que
   * se recupere bloquearia el request entero.
   */
  private async ready(): Promise<Redis | null> {
    const client = this.client;
    if (!client) return null;
    if (client.status === 'ready') return client;

    if (client.status === 'wait') {
      try {
        await client.connect();
      } catch (error: unknown) {
        this.noteFailure(
          new Error(
            (error as { message?: string } | null | undefined)?.message ??
              'fallo al conectar',
          ),
        );
        return null;
      }
      // `connect()` muta el status, pero TypeScript no lo sabe y mantiene el
      // estrechado a 'wait', asi que se relee a traves de `status()`.
      return this.status() === 'ready' ? client : null;
    }

    return null;
  }

  /**
   * Runs a Redis command, returning null on any failure so callers can fall
   * back instead of propagating a connection error to the request.
   */
  private async safe<T>(label: string, run: (client: Redis) => Promise<T>) {
    const client = await this.ready();
    if (!client) return null;
    try {
      return await run(client);
    } catch (error: unknown) {
      this.logger.warn(
        `Redis ${label} fallo: ${((error as { message?: string } | null | undefined)?.message ?? error) as string}`,
      );
      return null;
    }
  }

  async setHashField(
    key: string,
    field: string,
    value: string,
  ): Promise<boolean> {
    const result = await this.safe('hset', (client) =>
      client.hset(key, field, value),
    );
    return result !== null;
  }

  async getHashAll(key: string): Promise<Record<string, string> | null> {
    return this.safe('hgetall', (client) => client.hgetall(key));
  }

  /**
   * Lee un unico campo del hash.
   *
   * Existe para no tener que usar `getHashAll` cuando solo se necesita un
   * campo: traer el hash entero escala con el numero de entradas, asi que
   * un `HGETALL` por heartbeat es O(n) por cliente y O(n^2) en el conjunto.
   *
   * `undefined` = Redis caido. `null` = el campo no existe.
   */
  async getHashField(
    key: string,
    field: string,
  ): Promise<string | null | undefined> {
    if (!(await this.ready())) return undefined;
    return this.safeOrThrow('hget', (client) => client.hget(key, field));
  }

  async hashDel(key: string, field: string): Promise<boolean> {
    const result = await this.safe('hdel', (client) => client.hdel(key, field));
    return result !== null;
  }

  /** Adds a member to a sorted set scored by the given value. */
  async sortedSetAdd(
    key: string,
    member: string,
    score: number,
  ): Promise<boolean> {
    const result = await this.safe('zadd', (client) =>
      client.zadd(key, score, member),
    );
    return result !== null;
  }

  /** Removes every member scored at or below `maxScore` (inclusive). */
  async sortedSetTrim(key: string, maxScore: number): Promise<boolean> {
    const result = await this.safe('zremrangebyscore', (client) =>
      client.zremrangebyscore(key, '-inf', maxScore),
    );
    return result !== null;
  }

  async sortedSetCount(key: string): Promise<number | null> {
    return this.safe('zcard', (client) => client.zcard(key));
  }

  /** Returns members ordered by ascending score as `[member, score]` pairs. */
  async sortedSetRangeWithScores(
    key: string,
    offset: number,
    limit: number,
  ): Promise<Array<[string, string]> | null> {
    return this.safe('zrange', async (client) => {
      const flat = await client.zrange(key, offset, limit, 'WITHSCORES');
      const rows: Array<[string, string]> = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        rows.push([flat[i], flat[i + 1]]);
      }
      return rows;
    });
  }

  async sortedSetDeleteMembers(
    key: string,
    members: string[],
  ): Promise<boolean> {
    if (members.length === 0) return true;
    const result = await this.safe('zrem', (client) =>
      client.zrem(key, ...members),
    );
    return result !== null;
  }

  async setWithTtl(
    key: string,
    seconds: number,
    value: string,
  ): Promise<boolean> {
    const result = await this.safe('setex', (client) =>
      client.set(key, value, 'EX', seconds),
    );
    return result !== null;
  }

  /** Lectura y borrado atomicos (GETDEL), con repliegue a get+del en Redis < 6.2. */
  async getAndDelete(key: string): Promise<string | null> {
    const value = await this.safe('getdel', (client) => client.getdel(key));
    if (value !== null) return value;

    const fallback = await this.safe('get', (client) => client.get(key));
    if (fallback !== null) {
      await this.safe('del', (client) => client.del(key));
    }
    return fallback;
  }

  /**
   * Igual que `safe()` pero propaga el error. Usar cuando el llamador necesita
   * distinguir "no hay valor en cache" de "Redis esta caido", porque las dos
   * cosas requieren comportamientos distintos.
   */
  private async safeOrThrow<T>(
    label: string,
    run: (client: Redis) => Promise<T>,
  ): Promise<T> {
    const client = await this.ready();
    if (!client) throw new Error('Redis no disponible');
    try {
      return await run(client);
    } catch (error: unknown) {
      this.logger.warn(
        `Redis ${label} fallo: ${((error as { message?: string } | null | undefined)?.message ?? error) as string}`,
      );
      throw error;
    }
  }

  /**
   * Lectura de un valor simple. Devuelve `undefined` cuando Redis esta caido y
   * `null` cuando la clave simplemente no existe, para que el llamador pueda
   * distinguir un cache miss real de una caida de Redis.
   */
  async get(key: string): Promise<string | null | undefined> {
    if (!(await this.ready())) return undefined;
    return this.safeOrThrow('get', (client) => client.get(key));
  }

  /** Guarda un valor con TTL en segundos. */
  async set(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.safe('set', (client) =>
      client.set(key, value, 'EX', ttlSeconds),
    );
    return result !== null;
  }

  /** Borra claves exactas. */
  async del(...keys: string[]): Promise<number | undefined> {
    if (keys.length === 0) return 0;
    if (!(await this.ready())) return undefined;
    return this.safeOrThrow('del', (client) => client.del(...keys));
  }

  /**
   * Devuelve las claves que casan con un patron usando SCAN, no KEYS, para no
   * bloquear Redis mientras recorre el keyspace. `SCAN` puede repetir claves, asi
   * que se deduplican en un Set.
   */
  async getByPattern(pattern: string): Promise<string[] | undefined> {
    const client = await this.ready();
    if (!client) return undefined;

    let cursor = '0';
    const found = new Set<string>();

    do {
      const next = await this.safeOrThrow('scan', (c) =>
        c.scan(cursor, 'MATCH', pattern, 'COUNT', 250),
      );
      if (next === null) break;

      cursor = next[0];
      for (const key of next[1]) found.add(key);
    } while (cursor !== '0');

    return [...found];
  }

  /**
   * Borra todas las claves que casen con un patron. Usa SCAN en lugar de KEYS
   * para no bloquear Redis durante el recorrido.
   */
  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.getByPattern(pattern);
    if (keys === undefined || keys.length === 0) return 0;

    const count = await this.safeOrThrow('del', (c) => c.del(...keys));
    return count ?? 0;
  }

  /**
   * Contador de rate limiting atomico (INCR + expiracion) en un unico script Lua.
   *
   * `INCR` y `EXPIRE` por separado dejan una ventana en la que un contador
   * existe sin TTL y nunca expira, o dos incrementos comparten TTL. El script lo
   * hace atomico.
   *
   * Reproduce la semantica del storage en memoria de Nest:
   * - Si ya hay bloqueo activo, no se incrementa nada y se reporta el bloqueo.
   * - Al bloquear, el contador se reinicia a 0 con TTL igual a `blockMs`, para
   *   que al terminar el bloqueo el cliente tenga una ventana limpia en vez de
   *   ser re-bloqueado de inmediato.
   *
   * Devuelve los tiempos en **segundos**, que es la unidad que espera
   * `ThrottlerGuard` para las cabeceras `Retry-After` y `X-RateLimit-Reset`.
   */
  async throttleHit(
    key: string,
    ttlMs: number,
    limit: number,
    blockMs: number,
  ): Promise<
    | {
        totalHits: number;
        timeToExpire: number;
        isBlocked: boolean;
        timeToBlockExpire: number;
      }
    | undefined
  > {
    const client = await this.ready();
    if (!client) return undefined;

    const blockedKey = `${key}:blocked`;
    const script = `
      if redis.call('EXISTS', KEYS[2]) == 1 then
        return {0, 0, 1, redis.call('PTTL', KEYS[2])}
      end

      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end

      local ttl = redis.call('PTTL', KEYS[1])
      if ttl < 0 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
        ttl = tonumber(ARGV[1])
      end

      if current > tonumber(ARGV[2]) then
        redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
        redis.call('SET', KEYS[1], '0', 'PX', ARGV[3])
        return {current, ttl, 1, tonumber(ARGV[3])}
      end

      return {current, ttl, 0, 0}
    `;

    const result = await this.safeOrThrow(
      'throttle',
      (c) =>
        c.eval(
          script,
          2,
          key,
          blockedKey,
          String(ttlMs),
          String(limit),
          String(blockMs),
        ) as Promise<[number, number, number, number]>,
    );

    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] = result;

    return {
      totalHits: Number(totalHits),
      timeToExpire: Math.max(0, Math.ceil(Number(timeToExpireMs) / 1000)),
      isBlocked: Number(isBlocked) === 1,
      timeToBlockExpire: Math.max(
        0,
        Math.ceil(Number(timeToBlockExpireMs) / 1000),
      ),
    };
  }

  /**
   * Guarda la clave solo si no existe, con TTL. Es la primitiva de
   * "consume una vez" / anti-replay.
   *
   * `SET ... NX EX` es atomico en Redis: dos peticiones concurrentes con la
   * misma clave, solo una obtiene `true`. Con un `getAndDelete` o un
   * `set`+`get` separados, dos requests que llegan a la vez podrian pasar las
   * dos, que es justo el caso que el anti-replay tiene que impedir.
   *
   * `undefined` significa que Redis no esta disponible, para que el llamador
   * decida su fallback. `false` significa que la clave ya existia.
   */
  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean | undefined> {
    const client = await this.ready();
    if (!client) return undefined;

    try {
      const result = await client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`Redis setIfAbsent fallo: ${describe(error)}`);
      return undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }
}
