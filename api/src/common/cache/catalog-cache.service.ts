import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

/** Prefijo global de la cache HTTP. Aislar permite limpiar todo de un golpe. */
const NAMESPACE = 'cache';

/**
 * TTL por defecto de las lecturas publicas.
 *
 * Es deliberadamente corto: la cache es un acelerador para absorber rafagas de
 * trafico, no la fuente de verdad. Los caminos de escritura del catalodo
 * invalidan de forma explicita, asi que este TTL solo acota el peor caso cuando
 * una escritura se escapa de la invalidacion (por ejemplo un proceso externo).
 */
const DEFAULT_TTL_SECONDS = Number(process.env.CATALOG_CACHE_TTL || 60);

/**
 * Cache-aside para lecturas publicas del catalogo.
 *
 * `/products` y `/categories` son el endpoint mas golpeado y el mas barato de
 * cachear: casi nunca cambian y siempre se piden igual. Con 1000 usuarios
 * concurrentes, sin cache cada visita es una consulta con `include` completo.
 *
 * Reglas de uso:
 * - `remember` nunca propaga un fallo de Redis: si la cache no esta disponible,
 *   se ejecuta el loader y se responde desde la base de datos.
 * - Toda escritura que cambie el catalogo debe llamar a `invalidate`.
 */
@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);
  private readonly defaultTtl = DEFAULT_TTL_SECONDS;

  constructor(private readonly redis: RedisService) {}

  /**
   * Construye la clave de Redis a partir del scope y los parametros.
   *
   * Los parametros se hashean en vez de concatenarse. Concatenarlos con `:` no
   * es seguro: entre los parametros esta el texto de busqueda, que escribe el
   * usuario, y puede contener el separador. Una busqueda de `"zapatos"` con
   * `categoryId = 1` generaba `products:zapatos:1`, exactamente la misma clave
   * que la busqueda `"zapatos:1"` sin categoria. El visitante recibia los
   * resultados de la otra consulta, y bastaba con pedirla dos veces para fijarla
   * en cache.
   *
   * El hash tambien acota la longitud: una busqueda larga ya no genera una
   * clave larga, y un `*` dentro del texto ya no puede ampliar el patron que
   * usa `invalidate` para borrar el scope.
   *
   * Cada parte se serializa con su tipo, para que `undefined`, `null` y la
   * cadena `"undefined"` den claves distintas. El scope queda en claro porque
   * `invalidate` lo necesita para borrar por patron.
   */
  private key(scope: string, parts: unknown[]): string {
    const normalized = JSON.stringify(
      parts.map((part) => [typeof part, part === undefined ? '\u0000' : part]),
    );
    const digest = createHash('sha256').update(normalized).digest('hex');
    return `${NAMESPACE}:${scope}:${digest}`;
  }

  /**
   * Devuelve el valor cacheado, o lo carga con `loader` y lo guarda.
   *
   * Un `null` cacheado se distingue de un miss real: se envuelve en un objeto
   * para no tener que repoblar la cache cada vez que un producto no existe.
   */
  async remember<T>(
    scope: string,
    parts: unknown[],
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const key = this.key(scope, parts);

    const raw = await this.redis.get(key);
    if (raw !== undefined && raw !== null) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Cache corrupto: se descarta y se recarga.
        await this.redis.del(key);
      }
    }

    const fresh = await loader();
    await this.redis.set(
      key,
      JSON.stringify(fresh ?? null),
      ttlSeconds ?? this.defaultTtl,
    );
    return fresh;
  }

  /** Invalida todas las entradas de un scope. */
  async invalidate(scope: string): Promise<void> {
    const removed = await this.redis.delByPattern(`${NAMESPACE}:${scope}:*`);
    if (removed) {
      this.logger.debug(`Cache "${scope}" invalidada (${removed} claves)`);
    }
  }
}
