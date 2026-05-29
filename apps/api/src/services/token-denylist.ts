import type { Redis } from 'ioredis';

// Phase 1b — token revocation denylist (spec §11.1).
//
// GoTrue (Supabase Auth) issues the JWTs but has no per-token revocation; Redis owns the
// denylist so a logged-out / revoked token is rejected on BOTH HTTP and WS connect. The
// auth layer depends only on this interface, so it is unit-tested with the in-memory impl
// and wired to Redis in production (mirrors `cache-store.ts` / `tenant-field-store.ts`).
//
// Entries are keyed by the token's *revocation key* — the `jti` claim when present, else
// the GoTrue `session_id` (see `supabase-jwt.ts`) — and are stored with TTL = the token's
// remaining lifetime so revocations self-clean exactly when the token would have expired.

export interface TokenDenylist {
  /** Deny a revocation key for `ttlSeconds` (the token's remaining lifetime). */
  deny(key: string, ttlSeconds: number): Promise<void>;
  /** True if the revocation key has been denied and has not yet expired. */
  isDenied(key: string): Promise<boolean>;
}

const KEY_PREFIX = 'auth:jti:denylist:';

/** Redis-backed denylist; sets EXPIRE so revocations vanish at token expiry. */
export class RedisTokenDenylist implements TokenDenylist {
  constructor(private readonly redis: Redis) {}

  async deny(key: string, ttlSeconds: number): Promise<void> {
    // A non-positive TTL means the token is already expired — nothing to deny.
    if (ttlSeconds <= 0) return;
    await this.redis.set(`${KEY_PREFIX}${key}`, '1', 'EX', ttlSeconds);
  }

  async isDenied(key: string): Promise<boolean> {
    return (await this.redis.exists(`${KEY_PREFIX}${key}`)) === 1;
  }
}

/** Process-local denylist with TTL expiry — the test/dev fallback when Redis is absent. */
export class InMemoryTokenDenylist implements TokenDenylist {
  private readonly store = new Map<string, number>(); // key -> expiresAt (ms)

  async deny(key: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    this.store.set(key, Date.now() + ttlSeconds * 1000);
  }

  async isDenied(key: string): Promise<boolean> {
    const expiresAt = this.store.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
}
