import { gunzipSync, gzipSync } from 'node:zlib';
import type { Redis } from 'ioredis';

// Phase 1b — the L2 cache abstraction behind the schema registry (spec §3.4).
//
// SchemaRegistryService depends only on this interface, so it is unit-tested with the
// in-memory store and wired to Redis in production. Values are opaque strings (the
// service serializes/deserializes JSON itself); the Redis adapter gzip-compresses them
// per the Phase 1b plan ("Redis L2 cache (gzip, single-flight, 5-min TTL)").

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Process-local cache with TTL expiry — the test/dev fallback when Redis is absent. */
export class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/** Redis-backed store; gzips values to keep large /describe payloads compact. */
export class RedisCacheStore implements CacheStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    const buf = await this.redis.getBuffer(key);
    if (!buf) return null;
    return gunzipSync(buf).toString('utf8');
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, gzipSync(Buffer.from(value, 'utf8')), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
