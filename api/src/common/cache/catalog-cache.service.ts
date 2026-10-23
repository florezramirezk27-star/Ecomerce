import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

/** Prefijo global de la cache HTTP. Aislar permite limpiar todo de un golpe. */
const NAMESPACE = 'cache';

/**
 * Generacion que se usa en la clave cuando **no se puede saber** la real
 * (Redis no esta disponible). No colisiona con ninguna generacion real: las
 * generaciones son enteros no negativos.
 *
 * Con esta generacion no se lee ni se escribe nada en Redis: es solo una
 * marca para que el mapa de cargas en curso siga deduplicando.
 */
const SIN_GENERACION = '-';

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
 * - La cache es **opcional para las lecturas**: si Redis falla al leer o al
 *   guardar, el servicio se comporta como si no hubiera cache y responde
 *   desde la base de datos. Un fallo de cache nunca tumba una lectura.
 * - Un fallo del `loader` (por ejemplo, que PostgreSQL no responda) **si** se
 *   propaga: ahi no hay nada que servir.
 * - La invalidacion es **logica**: se sube una generacion compartida en Redis
 *   y las claves de cache la llevan dentro. Las peticiones siguientes usan
 *   claves nuevas y no pueden leer las entradas viejas, ni siquiera si una
 *   consulta antigua termina despues y intenta guardarlas.
 * - Toda escritura que cambie el catalogo debe llamar a `invalidate`.
 */
@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);
  private readonly defaultTtl = DEFAULT_TTL_SECONDS;

  /**
   * Evita inundar los logs si Redis falla repetidamente.
   *
   * Si Redis se cae, todas las peticiones fallan por el mismo motivo: con un
   * aviso por fallo el log se llena de miles de lineas identicas y se pierde
   * el resto de la informacion. Se avisa como mucho una vez por intervalo.
   */
  private lastCacheWarning = 0;
  private readonly warningIntervalMs = 30_000;

  constructor(private readonly redis: RedisService) {}

  /**
   * Registra un fallo de cache una sola vez por intervalo.
   *
   * El mensaje deja claro que se sigue funcionando sin cache, para que el
   * aviso no se lea como una caida de la tienda.
   */
  private warnCacheFailure(operation: string, error?: unknown): void {
    const now = Date.now();
    if (now - this.lastCacheWarning < this.warningIntervalMs) return;

    this.lastCacheWarning = now;
    const detail = error instanceof Error ? `: ${error.message}` : '';

    this.logger.warn(
      `Cache Redis: fallo al ${operation}; se continúa sin depender de la caché${detail}`,
    );
  }

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
   *
   * La **generacion** va en la clave, entre el scope y el hash. Es lo que hace
   * que una invalidacion sirva: al subir la generacion, las peticiones
   * siguientes usan una clave distinta y no pueden leer las entradas de la
   * generacion anterior, sin necesidad de borrarlas.
   */
  private key(
    scope: string,
    generacion: number | undefined,
    hash: string,
  ): string {
    return `${NAMESPACE}:${scope}:${generacion ?? SIN_GENERACION}:${hash}`;
  }

  /** Hash de los parametros de la consulta. */
  private hash(parts: unknown[]): string {
    const normalized = JSON.stringify(
      parts.map((part) => [typeof part, part === undefined ? '\u0000' : part]),
    );
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Cargas en curso, por clave de cache.
   *
   * Es el mecanismo de *single-flight*: si varias peticiones piden la misma
   * clave mientras la cache esta vacia, todas esperan a la misma carga en vez
   * de lanzar cada una su consulta a PostgreSQL. Sin esto, 100 visitantes
   * abriendo la misma pagina con la cache fria generaban 100 consultas
   * identicas al mismo tiempo.
   *
   * El mapa es de esta instancia: entre replicas de la API cada una mantiene
   * el suyo. La deduplicacion es por proceso, no global, que es lo que
   * permite hacerlo sin coordinacion entre nodos.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Lee la cache. Devuelve `{ hit: true }` solo si habia una entrada valida.
   *
   * El valor cacheado puede ser `null` de verdad (un producto que no existe
   * se cachea como `null` para no repoblar la cache en cada peticion), asi que
   * el acierto y el valor van juntos en el resultado en vez de devolver `null`
   * como "no hay nada".
   */
  private async readCache<T>(
    key: string,
  ): Promise<{ hit: true; value: T } | { hit: false }> {
    // Un fallo de lectura de Redis debe convertirse en un cache miss.
    try {
      const raw = await this.redis.get(key);

      if (raw !== undefined && raw !== null) {
        try {
          return { hit: true, value: JSON.parse(raw) as T };
        } catch {
          // La entrada está corrupta. Intentamos borrarla,
          // pero un fallo al borrarla no debe impedir recargar los datos.
          try {
            await this.redis.del(key);
          } catch (error: unknown) {
            this.warnCacheFailure('eliminar una entrada corrupta', error);
          }
        }
      }
    } catch (error: unknown) {
      this.warnCacheFailure('leer', error);
    }

    return { hit: false };
  }

  /**
   * Carga los datos y los guarda en la cache.
   *
   * Los errores del loader (por ejemplo, PostgreSQL) sí se propagan. Los fallos
   * al guardar no: son una pura optimizacion.
   *
   * Si la generacion cambio mientras se cargaba, la carga es **obsoleta**:
   * puede completar las peticiones que ya la esperaban (ya no hay nada que
   * hacer por ellas) pero **no** debe escribirse, o la generacion nueva
   * quedaria contaminada con datos anteriores a la invalidacion.
   */
  private async loadAndStore<T>(
    scope: string,
    generacion: number | undefined,
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    // Los errores del loader (por ejemplo, PostgreSQL) sí se propagan.
    const fresh = await loader();

    /* Sin generacion no hay cache donde guardar: Redis no esta disponible.
       Se devuelven los datos y no se intenta nada mas. */
    if (generacion === undefined) return fresh;

    /* Comprobacion de generacion antes de escribir.

       Es la pieza que cierra la condicion de carrera: una consulta que empezo
       antes de una actualizacion no puede escribir su resultado viejo en la
       generacion nueva. La comprobacion no es atomica con el `set`, asi que
       hay una ventana minima en la que una invalidacion podria ocurrir entre
       las dos. Es aceptable: la siguiente peticion leera la generacion nueva
       y no encontrara esta entrada, porque su clave lleva la generacion
       anterior. */
    const actual = await this.redis.getGeneration(scope);
    if (actual !== generacion) {
      this.logger.debug(
        `Cache de "${scope}" cargada en la generacion ${generacion} y descartada: la vigente es ${actual}`,
      );
      return fresh;
    }

    // Guardar en caché es una optimización: si falla, devolvemos los datos.
    try {
      const saved = await this.redis.set(
        key,
        JSON.stringify(fresh ?? null),
        ttlSeconds ?? this.defaultTtl,
      );

      if (!saved) {
        this.warnCacheFailure('guardar');
      }
    } catch (error: unknown) {
      this.warnCacheFailure('guardar', error);
    }

    return fresh;
  }

  /**
   * Devuelve el valor cacheado, o lo carga con `loader` y lo guarda.
   *
   * Un `null` cacheado se distingue de un miss real: se envuelve en un objeto
   * para no tener que repoblar la cache cada vez que un producto no existe.
   *
   * Redis puede fallar de tres maneras y las tres se tratan como "no hay
   * cache": devuelve `undefined` si esta desconectado, lanza si el comando
   * falla, y `set` puede devolver `false` si no logra guardar. En ningun caso
   * se rompe la lectura.
   */
  async remember<T>(
    scope: string,
    parts: unknown[],
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const hash = this.hash(parts);

    /* Generacion vigente del scope.

       `undefined` significa que no se puede saber (Redis caido): no hay cache
       que leer ni en la que escribir, pero la deduplicacion de cargas sigue
       funcionando. */
    let generacion = await this.redis.getGeneration(scope);
    let key = this.key(scope, generacion, hash);

    if (generacion !== undefined) {
      const cached = await this.readCache<T>(key);
      if (cached.hit) {
        /* La generacion puede haber cambiado entre leerla y leer el valor:
           en ese caso la entrada es de una generacion vieja y no se debe
           servir. Se comprueba otra vez antes de devolverla. */
        const actual = await this.redis.getGeneration(scope);
        if (actual === generacion) return cached.value;

        /* Cambio a mitad de camino. La entrada es obsoleta: se descarta y se
           sigue con la generacion nueva, que es la que deben usar a partir de
           ahora las peticiones. */
        generacion = actual;
        key = this.key(scope, generacion, hash);
      }
    }

    /* Single-flight.

       La comprobacion y el registro tienen que ser **consecutivos, sin un
       `await` entre medias**: si se comprobara antes de leer la cache, dos
       peticiones podrian leer la cache a la vez, ambas verian un miss y ambas
       registrarian su propia carga. Con el `await` ya hecho, la ventana es
       una sola y el registro es atomico (JavaScript es de un solo hilo). */
    const enCurso = this.inFlight.get(key);
    if (enCurso) return enCurso as Promise<T>;

    const carga = this.loadAndStore<T>(
      scope,
      generacion,
      key,
      loader,
      ttlSeconds,
    );
    this.inFlight.set(key, carga);

    try {
      return await carga;
    } finally {
      /* Se quita la entrada tanto si la carga fue bien como si fallo: si
         fallara, dejarla pondria a esperar a todos los siguientes a un error
         que ya se sabe que se va a repetir. */
      this.inFlight.delete(key);
    }
  }

  /**
   * Invalida todas las entradas de un scope.
   *
   * La invalidacion es **logica**, no fisica: se sube la generacion del scope
   * y a partir de ese momento las peticiones usan claves distintas. Las
   * entradas viejas quedan huerfanas y se van borrando por TTL.
   *
   * Esto resuelve la condicion de carrera que el borrado por patron no
   * podia: una consulta que empezo antes de la actualizacion puede terminar
   * despues, pero su resultado ya no puede escribirse en la generacion
   * nueva, asi que no puede volver a servirse.
   *
   * Si Redis no responde se avisa y se sigue: la escritura en la base de datos
   * no debe fallar por un problema de cache. El precio de esa decision es que
   * pueden quedar entradas viejas sirviendo hasta que expire el TTL, y con
   * Redis caido la invalidacion distribuida **no** esta garantizada.
   */
  async invalidate(scope: string): Promise<void> {
    try {
      /* Subir la generacion es el paso que invalida. `INCR` es atomico, asi
         que dos invalidaciones simultaneas producen dos generaciones
         distintas en vez de pisarse. */
      const nueva = await this.redis.bumpGeneration(scope);

      if (nueva === undefined) {
        this.warnCacheFailure('invalidar');
        return;
      }

      /* Limpieza de la generacion anterior. Es solo memoria: las claves
         viejas ya no las lee nadie porque su generacion no es la vigente.
         El borrado se limita a la generacion anterior, nunca a la nueva, para
         no tirar la entrada que otro proceso acaba de guardar. */
      const anterior = nueva - 1;
      if (anterior < 0) return;

      const removed = await this.redis.delByPattern(
        `${NAMESPACE}:${scope}:${anterior}:*`,
      );

      if (removed === undefined) {
        this.warnCacheFailure('invalidar');
        return;
      }

      if (removed > 0) {
        this.logger.debug(`Cache invalidada para ${scope}: ${removed} claves`);
      }
    } catch (error: unknown) {
      this.warnCacheFailure('invalidar', error);
    }
  }
}
