import type { PlatformField } from '@ops/shared';
import type { Registry } from '@ops/compiler';
import type { CacheStore } from './cache-store';
import type { TenantFieldStore } from './tenant-field-store';

// Phase 1b — /describe: merge platform (Tier 1) + tenant (Tier 2) fields (spec §3.5).
//
// Reads the platform entity through the existing `Registry` interface (PostgresRegistry
// in prod, MockRegistry in tests) and overlays the tenant's Tier 2 extensions. The result
// is cached in the L2 store (gzip, 5-min TTL) with single-flight so a cache stampede
// collapses to one merge. A tenant field change invalidates the key (Schema Builder calls
// `invalidate()`), which in prod fans out via Redis pub/sub to every node.

const DEFAULT_TTL_SECONDS = 300; // 5 minutes, per the Phase 1b plan.

export interface DescribeResult {
  entity: string;
  label: string;
  resource: string;
  tool_ops: string[];
  /** Tier 1 platform fields + Tier 2 tenant fields, sorted by sort_order then name. */
  fields: PlatformField[];
}

export interface SchemaRegistryOptions {
  ttlSeconds?: number;
  /** Cache-key namespace; lets tests isolate and prod version-bust. */
  keyPrefix?: string;
}

export class SchemaRegistryService {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;
  /** Single-flight: concurrent identical describes share one in-flight build. */
  private readonly inflight = new Map<string, Promise<DescribeResult>>();

  constructor(
    private readonly registry: Registry,
    private readonly tenantFields: TenantFieldStore,
    private readonly cache: CacheStore,
    opts: SchemaRegistryOptions = {},
  ) {
    this.ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.keyPrefix = opts.keyPrefix ?? 'schema:describe';
  }

  private cacheKey(tenantId: string, entityName: string): string {
    return `${this.keyPrefix}:${tenantId}:${entityName}`;
  }

  /** Tier 1 + Tier 2 merge, cached. Throws if the entity is unknown to the platform. */
  async describe(tenantId: string, entityName: string): Promise<DescribeResult> {
    const key = this.cacheKey(tenantId, entityName);

    const cached = await this.cache.get(key);
    if (cached) return JSON.parse(cached) as DescribeResult;

    // Single-flight: collapse concurrent misses to one build per key.
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const build = this.buildAndCache(tenantId, entityName, key).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, build);
    return build;
  }

  private async buildAndCache(
    tenantId: string,
    entityName: string,
    key: string,
  ): Promise<DescribeResult> {
    const entity = this.registry.getEntity(entityName);
    if (!entity) {
      throw new EntityNotFoundError(entityName);
    }

    const platformFields = this.registry.getEntityFields(entityName);
    const tenantFields = await this.tenantFields.list(tenantId, entityName);

    const result: DescribeResult = {
      entity: entity.name,
      label: entity.label,
      resource: entity.resource,
      tool_ops: entity.tool_ops,
      fields: mergeFields(platformFields, tenantFields),
    };

    await this.cache.set(key, JSON.stringify(result), this.ttlSeconds);
    return result;
  }

  /** Drop the cached merge for a (tenant, entity) — called after a schema mutation. */
  async invalidate(tenantId: string, entityName: string): Promise<void> {
    await this.cache.del(this.cacheKey(tenantId, entityName));
  }
}

export class EntityNotFoundError extends Error {
  constructor(public readonly entityName: string) {
    super(`Unknown entity: ${entityName}`);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * Merge Tier 1 platform fields with Tier 2 tenant fields. Tenant fields are forced to
 * is_system=false; the result is sorted by sort_order then name (spec §3.5). A tenant
 * field never shadows a platform field of the same name — that collision is rejected up
 * front by the Schema Builder's 409, so here both are simply included by identity.
 */
export function mergeFields(
  platformFields: readonly PlatformField[],
  tenantFields: readonly PlatformField[],
): PlatformField[] {
  const merged: PlatformField[] = [
    ...platformFields,
    ...tenantFields.map((f) => ({ ...f, is_system: false })),
  ];
  return merged.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
