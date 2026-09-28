import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

/** Un visitante se considera en vivo si gpio en los ultimos PRESENCE_TTL_MS. */
export const PRESENCE_TTL_MS = 90_000;

/** Cada cuanto el storefront renueva su presencia. */
export const PRESENCE_HEARTBEAT_MS = 30_000;

const SCORE_KEY = 'presence:storefront:scores';
const META_KEY = 'presence:storefront:meta';
const META_MAX_AGE_MS = PRESENCE_TTL_MS * 4;

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const MAX_RECENT = 20;
const MAX_PATH_LENGTH = 200;

export interface PresenceMeta {
  visitorId: string;
  firstSeenAt: number;
  lastPath: string;
  referrer: string;
  userId: string | null;
  isReturning: boolean;
}

export interface PresenceSnapshot {
  online: number;
  registered: number;
  guests: number;
  ttlMs: number;
  heartbeatMs: number;
  source: 'redis' | 'memory';
  recent: PresenceMeta[];
  serverTime: number;
}

interface MemoryEntry extends PresenceMeta {
  lastSeenAt: number;
}

function sanitize(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

function normalizeVisitorId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return VISITOR_ID_PATTERN.test(id) ? id : null;
}

/**
 * Presencia de visitantes del storefront.
 *
 * Redis guarda un sorted set (visitorId -> ultimo latido en ms) mas un hash con
 * los metadatos, de modo que el conteo es atomico y compartido entre instancias
 * de la API. Si REDIS_URL no esta configurado cae a un Map en memoria, que
 * mantiene el mismo comportamiento dentro de una sola instancia.
 */
@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly redis: RedisService) {
    this.sweeper = setInterval(() => {
      void this.sweep();
    }, PRESENCE_TTL_MS);
    this.sweeper.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private pruneMemory(now: number) {
    for (const [id, entry] of this.memory) {
      if (now - entry.lastSeenAt > PRESENCE_TTL_MS) this.memory.delete(id);
    }
  }

  /** Limpia metadatos huerfanos que ya no tienen un visitante en vivo. */
  private async sweep() {
    const now = Date.now();

    this.pruneMemory(now);

    if (!this.redis.isEnabled()) return;

    const cutoff = now - META_MAX_AGE_MS;
    const meta = await this.redis.getHashAll(META_KEY);
    if (!meta) return;

    const orphans = Object.keys(meta).filter((id) => {
      const firstSeenAt = Number(JSON.parse(meta[id] || '{}').firstSeenAt ?? 0);
      return Number.isFinite(firstSeenAt) && firstSeenAt < cutoff;
    });

    if (orphans.length > 0) {
      for (const id of orphans) {
        await this.redis.hashDel(META_KEY, id);
      }
    }
  }

  /**
   * Registra un latido. Devuelve el conteo en vivo resultante para que el
   * cliente pueda descartar la respuesta si ya no le importa.
   */
  async heartbeat(input: {
    visitorId: string | null;
    lastPath?: unknown;
    referrer?: unknown;
    userId?: string | null;
  }): Promise<{ visitorId: string | null; online: number }> {
    const now = Date.now();
    const visitorId = normalizeVisitorId(input.visitorId);
    if (!visitorId) return { visitorId: null, online: await this.count() };

    const lastPath = sanitize(input.lastPath, MAX_PATH_LENGTH);
    const referrer = sanitize(input.referrer, MAX_PATH_LENGTH);
    const userId = input.userId ?? null;

    if (this.redis.isEnabled()) {
      const stored = await this.redis.sortedSetAdd(SCORE_KEY, visitorId, now);
      if (stored) {
        // `HGET` y no `HGETALL`: solo hace falta el campo de ESTE visitante.
        // Traer el hash entero hacia que el coste de cada latido creciera con
        // el numero de visitantes activos, y con 1000 usuarios concurrentes
        // cada ronda de latidos arrastraba el estado de los 999 otros.
        const previous = await this.redis.getHashField(META_KEY, visitorId);
        let firstSeenAt = now;
        if (previous) {
          const parsed = this.parseMeta(previous);
          if (parsed) firstSeenAt = parsed.firstSeenAt;
        }

        await this.redis.setHashField(
          META_KEY,
          visitorId,
          JSON.stringify({
            visitorId,
            firstSeenAt,
            lastPath,
            referrer,
            userId,
            isReturning: firstSeenAt < now - PRESENCE_TTL_MS,
          } satisfies PresenceMeta),
        );

        const online = await this.count();
        return { visitorId, online };
      }
    }

    const previousEntry = this.memory.get(visitorId);
    this.memory.set(visitorId, {
      visitorId,
      firstSeenAt: previousEntry?.firstSeenAt ?? now,
      lastPath,
      referrer,
      userId,
      isReturning: previousEntry
        ? now - previousEntry.lastSeenAt > PRESENCE_TTL_MS
        : false,
      lastSeenAt: now,
    });
    this.pruneMemory(now);

    return { visitorId, online: this.memory.size };
  }

  /** Marca al visitante como desconectado (best effort, se pierde si se cae la red). */
  async leave(rawVisitorId: unknown): Promise<number> {
    const visitorId = normalizeVisitorId(rawVisitorId);
    if (!visitorId) return this.count();

    this.memory.delete(visitorId);

    if (this.redis.isEnabled()) {
      await this.redis.sortedSetDeleteMembers(SCORE_KEY, [visitorId]);
    }

    return this.count();
  }

  /** Conteo en vivo, podando primero a los que /. */
  private async count(): Promise<number> {
    if (this.redis.isEnabled()) {
      const pruned = await this.redis.sortedSetTrim(
        SCORE_KEY,
        Date.now() - PRESENCE_TTL_MS,
      );
      if (pruned) {
        const total = await this.redis.sortedSetCount(SCORE_KEY);
        if (total !== null) return total;
      }
    }

    this.pruneMemory(Date.now());
    return this.memory.size;
  }

  private parseMeta(raw: string): PresenceMeta | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.firstSeenAt !== 'number') return null;
      return parsed as PresenceMeta;
    } catch {
      return null;
    }
  }

  async getSnapshot(limit = MAX_RECENT): Promise<PresenceSnapshot> {
    const now = Date.now();
    const capped = Math.min(Math.max(limit, 0), MAX_RECENT);
    const cutoff = now - PRESENCE_TTL_MS;

    const metaRaw = (await this.redis.getHashAll(META_KEY)) ?? {};
    const useMemory = !this.redis.isEnabled();

    let rows: Array<{ visitorId: string; score: number }> = [];

    if (!useMemory) {
      const pruned = await this.redis.sortedSetTrim(SCORE_KEY, cutoff);
      if (pruned) {
        const online = await this.redis.sortedSetCount(SCORE_KEY);
        const range = await this.redis.sortedSetRangeWithScores(
          SCORE_KEY,
          0,
          MAX_RECENT,
        );

        if (online !== null && range) {
          return this.buildSnapshot(
            online,
            range
              .map(([visitorId, score]) => ({
                visitorId,
                score: Number(score),
              }))
              .filter((row) => Number.isFinite(row.score)),
            metaRaw,
            'redis',
            now,
            capped,
          );
        }
      }

      this.logger.debug('Redis no respondio, usando presencia en memoria');
    }

    this.pruneMemory(now);
    rows = Array.from(this.memory.values())
      .map((entry) => ({ visitorId: entry.visitorId, score: entry.lastSeenAt }))
      .sort((a, b) => b.score - a.score);

    return this.buildSnapshot(
      this.memory.size,
      rows,
      metaRaw,
      'memory',
      now,
      capped,
    );
  }

  private buildSnapshot(
    online: number,
    rows: Array<{ visitorId: string; score: number }>,
    metaRaw: Record<string, string>,
    source: 'redis' | 'memory',
    now: number,
    limit: number,
  ): PresenceSnapshot {
    const metas = new Map<string, PresenceMeta>();

    for (const row of rows) {
      const raw = metaRaw[row.visitorId];
      if (raw) {
        const parsed = this.parseMeta(raw);
        if (parsed) {
          metas.set(row.visitorId, parsed);
          continue;
        }
      }
      const fallback = this.memory.get(row.visitorId);
      if (fallback) {
        metas.set(row.visitorId, {
          visitorId: fallback.visitorId,
          firstSeenAt: fallback.firstSeenAt,
          lastPath: fallback.lastPath,
          referrer: fallback.referrer,
          userId: fallback.userId,
          isReturning: fallback.isReturning,
        });
      }
    }

    const recent = [...rows]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ visitorId }) => {
        const meta = metas.get(visitorId);
        return (
          meta ?? {
            visitorId,
            firstSeenAt: now,
            lastPath: '',
            referrer: '',
            userId: null,
            isReturning: false,
          }
        );
      });

    const registered = [...metas.values()].filter((meta) =>
      Boolean(meta.userId),
    ).length;

    return {
      online,
      registered: Math.min(registered, online),
      guests: Math.max(online - Math.min(registered, online), 0),
      ttlMs: PRESENCE_TTL_MS,
      heartbeatMs: PRESENCE_HEARTBEAT_MS,
      source,
      recent,
      serverTime: now,
    };
  }
}
