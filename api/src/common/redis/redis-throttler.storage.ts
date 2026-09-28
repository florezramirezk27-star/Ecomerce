import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

/**
 * `ThrottlerStorageRecord` no se exporta desde la raiz de `@nestjs/throttler`,
 * asi que se replica su forma. La asignacion a `ThrottlerStorage` sigue siendo
 * valida por tipado estructural.
 */
interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Registro que nunca bloquea, usado cuando Redis no responde. */
const FAIL_OPEN: ThrottlerRecord = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
};

/**
 * Storage de rate limiting respaldado por Redis.
 *
 * El storage por defecto de Nest usa un `Map` en memoria que nunca se poda y
 * crea un `setTimeout` por cada request. Con 1000 usuarios eso son miles de
 * timers vivos por instancia, y el limite real se multiplica por el numero de
 * nodos, asi que no llega a ser una garantia de seguridad.
 *
 * Con Redis el limite es global entre replicas y cada ventana expira sola.
 *
 * Si Redis no esta disponible se **falla abierto**: se devuelve un registro que
 * no bloquea, para que una caida de Redis no tumbe la tienda. El resto de la
 * proteccion (CSRF, validacion, guards) sigue activa.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    try {
      const record = await this.redis.throttleHit(
        `throttle:${throttlerName}:${key}`,
        ttl,
        limit,
        blockDuration,
      );

      return record ?? { ...FAIL_OPEN };
    } catch (error) {
      this.logger.warn(
        `Rate limiting en modo failover para "${throttlerName}": ${
          (error as Error).message
        }`,
      );
      return { ...FAIL_OPEN };
    }
  }
}
