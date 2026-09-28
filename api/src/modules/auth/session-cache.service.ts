import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

export interface CachedSession {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  expiresAt: number;
}

/**
 * TTL maximo del cache de sesion.
 *
 * El TTL real es el tiempo que falta para que expire la sesion, recortado a este
 * tope. Asi el cache sigue siendo la fuente rapida de verdad para la sesion, pero
 * un cambio de rol, un bloqueo de cuenta o una revocacion se propagan en menos de
 * `SESSION_CACHE_TTL_SECONDS` segundos sin depender de que se cachee la
 * invalidacion.
 */
const MAX_TTL_SECONDS = Number(process.env.SESSION_CACHE_TTL_SECONDS || 120);

const sessionKey = (sessionId: string) => `auth:sess:${sessionId}`;
const userSessionsKey = (userId: string) => `auth:user-sessions:${userId}`;

/**
 * Cache de la sesion validada del JWT.
 *
 * Sin esto, `JwtStrategy.validate` hace `User.findUnique` + `Session.findUnique`
 * en *cada* request autenticado: son 2 queries antes de que la logica de negocio
 * llegue a ejecutarse. Con 1000 usuarios concurrentes eso son 2000 queries extra
 * por segundo solo en autenticacion.
 *
 * El cache es un acelerador, nunca la fuente de verdad: cualquier fallo o
 * ausencia de Redis hace que el llamante caiga a la base de datos, que es el
 * comportamiento original.
 */
@Injectable()
export class SessionCacheService {
  private readonly logger = new Logger(SessionCacheService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * `null` significa "no hay nada usable en cache" (miss o Redis caido); el
   * llamante debe consultar la base de datos.
   */
  async get(sessionId: string): Promise<CachedSession | null> {
    const raw = await this.redis.get(sessionKey(sessionId));
    if (raw === undefined || raw === null) return null;

    try {
      const parsed = JSON.parse(raw) as CachedSession;

      if (parsed.expiresAt <= Date.now()) {
        await this.invalidate(sessionId);
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  async set(sessionId: string, data: CachedSession): Promise<void> {
    const remainingSeconds = Math.floor((data.expiresAt - Date.now()) / 1000);
    if (remainingSeconds <= 0) return;

    const ttl = Math.min(remainingSeconds, MAX_TTL_SECONDS);
    const ok = await this.redis.set(
      sessionKey(sessionId),
      JSON.stringify(data),
      ttl,
    );
    if (!ok) return;

    // Indice inverso para poder invalidar todas las sesiones de un usuario
    // (logout global, logout por token) sin consultar la base de datos.
    await this.redis.set(
      `${userSessionsKey(data.userId)}:${sessionId}`,
      '1',
      ttl,
    );
  }

  async invalidate(sessionId: string): Promise<void> {
    const raw = await this.redis.get(sessionKey(sessionId));
    await this.redis.del(
      sessionKey(sessionId),
      `${sessionKey(sessionId)}:blocked`,
    );

    if (raw === undefined || raw === null) return;
    try {
      const parsed = JSON.parse(raw) as CachedSession;
      await this.redis.del(`${userSessionsKey(parsed.userId)}:${sessionId}`);
    } catch {
      // Sin datos no hay indice que limpiar.
    }
  }

  /**
   * Invalida todas las sesiones cacheadas de un usuario. Necesario en
   * `logout` sin `sessionId` y en `logoutByToken`, que borran filas de la base
   * de datos pero dejarian el cache sirviendo token valido hasta que expire.
   */
  async invalidateUser(userId: string): Promise<void> {
    const keys = await this.redis.getByPattern(`${userSessionsKey(userId)}:*`);
    if (keys === undefined || keys.length === 0) return;

    const targets = keys.flatMap((key) => {
      const sessionId = key.slice(`${userSessionsKey(userId)}:`.length);
      return [sessionKey(sessionId), `${sessionKey(sessionId)}:blocked`, key];
    });

    const removed = await this.redis.del(...targets);
    if (removed) {
      this.logger.debug(
        `Cache de sesion invalidado para ${userId} (${removed} claves)`,
      );
    }
  }
}
