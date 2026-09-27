import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Shared Redis client for production services (Upstash-compatible). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: Redis;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      tls: url.startsWith('rediss://') ? {} : undefined,
    });
    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (this.client.status === 'wait') await this.client.connect();
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** True when a REDIS_URL is configured and the client was constructed. */
  isEnabled(): boolean {
    return Boolean(this.client);
  }

  /**
   * Resolves a connected client, or null when Redis is not configured or the
   * connection is down. Callers must always provide a non-Redis fallback.
   */
  private async ready(): Promise<Redis | null> {
    if (!this.client) return null;
    try {
      if (this.client.status === 'wait') await this.client.connect();
      if (this.client.status !== 'ready') return null;
      return this.client;
    } catch (error: any) {
      this.logger.warn(`Redis no disponible: ${error?.message ?? error}`);
      return null;
    }
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
    } catch (error: any) {
      this.logger.warn(`Redis ${label} fallo: ${error?.message ?? error}`);
      return null;
    }
  }

  async setHashField(key: string, field: string, value: string): Promise<boolean> {
    const result = await this.safe('hset', (client) =>
      client.hset(key, field, value),
    );
    return result !== null;
  }

  async getHashAll(key: string): Promise<Record<string, string> | null> {
    return this.safe('hgetall', (client) => client.hgetall(key));
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

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }
}
