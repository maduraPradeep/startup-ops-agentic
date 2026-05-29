import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '../db/supabase-client';

// Phase 1b — entity storage (spec §3.6, §6). JSONB hybrid: typed core columns +
// an `extended_data` JSONB blob for tenant (Tier 2) field extensions.
//
// The store is deliberately generic over a CollectionDescriptor so the service owns
// the registry-driven typed/extended split and the (fixed, never user-supplied)
// table + column allowlist. Table and column identifiers therefore always come from
// the descriptor — never from request input — keeping raw identifiers out of SQL.
// EntityService depends only on this interface so it is unit-tested with the
// in-memory store and wired to Postgres in production (mirrors TenantFieldStore).

/** Physical storage shape for a storable collection. */
export interface CollectionDescriptor {
  /** API/resource name, e.g. "employees". */
  collection: string;
  /** Registry entity name (for /describe), e.g. "people". */
  entity: string;
  /** Physical table name. */
  table: string;
  /** Writable typed columns (Tier 1 system fields, minus auto-managed). */
  coreColumns: readonly string[];
}

/** A flattened entity row: typed columns + extended_data merged, plus metadata. */
export interface EntityRecord {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}

export interface ListOptions {
  page?: number;
  limit?: number;
  /** Equality filter; only keys matching core columns are applied. */
  filter?: Record<string, unknown>;
}

export interface ListResult {
  data: EntityRecord[];
  meta: { total_count: number; page: number; limit: number };
}

/** Split payload: typed core columns vs Tier 2 extended JSONB. */
export interface SplitPayload {
  core: Record<string, unknown>;
  extended: Record<string, unknown>;
}

export interface EntityStore {
  list(d: CollectionDescriptor, tenantId: string, opts?: ListOptions): Promise<ListResult>;
  findById(d: CollectionDescriptor, tenantId: string, id: string): Promise<EntityRecord | null>;
  insert(d: CollectionDescriptor, tenantId: string, payload: SplitPayload): Promise<EntityRecord>;
  update(
    d: CollectionDescriptor,
    tenantId: string,
    id: string,
    payload: SplitPayload,
  ): Promise<EntityRecord | null>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function clampPage(page?: number): number {
  if (!page || page < 1) return 1;
  return Math.floor(page);
}

/** Flatten a DB row (typed columns + extended_data JSONB) into a single object. */
function flattenRow(row: Record<string, unknown>): EntityRecord {
  const { extended_data, ...rest } = row;
  const extended =
    extended_data && typeof extended_data === 'object' ? (extended_data as object) : {};
  return { ...rest, ...extended } as EntityRecord;
}

/** Postgres-backed store over the per-tenant entity tables (002_entities.sql). */
export class PostgresEntityStore implements EntityStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(
    d: CollectionDescriptor,
    tenantId: string,
    opts: ListOptions = {},
  ): Promise<ListResult> {
    const page = clampPage(opts.page);
    const limit = clampLimit(opts.limit);
    const offset = (page - 1) * limit;

    // Only equality filters on known core columns are honored (allowlisted).
    const filterCols = Object.keys(opts.filter ?? {}).filter((k) => d.coreColumns.includes(k));
    const params: unknown[] = [tenantId];
    const where = ['tenant_id = $1'];
    for (const col of filterCols) {
      params.push(opts.filter![col]);
      where.push(`${col} = $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const countRows = await this.client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${d.table} WHERE ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT * FROM ${d.table} WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return {
      data: rows.map(flattenRow),
      meta: { total_count: total, page, limit },
    };
  }

  async findById(
    d: CollectionDescriptor,
    tenantId: string,
    id: string,
  ): Promise<EntityRecord | null> {
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT * FROM ${d.table} WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ? flattenRow(rows[0]) : null;
  }

  async insert(
    d: CollectionDescriptor,
    tenantId: string,
    payload: SplitPayload,
  ): Promise<EntityRecord> {
    const coreCols = Object.keys(payload.core).filter((c) => d.coreColumns.includes(c));
    const cols = ['tenant_id', ...coreCols, 'extended_data'];
    const values: unknown[] = [
      tenantId,
      ...coreCols.map((c) => payload.core[c]),
      JSON.stringify(payload.extended ?? {}),
    ];
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    const rows = await this.client.query<Record<string, unknown>>(
      `INSERT INTO ${d.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values,
    );
    return flattenRow(rows[0]!);
  }

  async update(
    d: CollectionDescriptor,
    tenantId: string,
    id: string,
    payload: SplitPayload,
  ): Promise<EntityRecord | null> {
    const coreCols = Object.keys(payload.core).filter((c) => d.coreColumns.includes(c));
    const hasExtended = Object.keys(payload.extended ?? {}).length > 0;

    if (coreCols.length === 0 && !hasExtended) {
      return this.findById(d, tenantId, id);
    }

    const sets: string[] = [];
    const params: unknown[] = [id, tenantId];
    for (const col of coreCols) {
      params.push(payload.core[col]);
      sets.push(`${col} = $${params.length}`);
    }
    if (hasExtended) {
      // Shallow-merge the JSONB so partial extended updates don't clobber siblings.
      params.push(JSON.stringify(payload.extended));
      sets.push(`extended_data = extended_data || $${params.length}::jsonb`);
    }
    sets.push('updated_at = NOW()');

    const rows = await this.client.query<Record<string, unknown>>(
      `UPDATE ${d.table} SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );
    return rows[0] ? flattenRow(rows[0]) : null;
  }
}

/** Process-local store — the test/dev fallback when no DB is configured. */
export class InMemoryEntityStore implements EntityStore {
  // keyed by table → id → record (core + extended flattened + metadata)
  private readonly tables = new Map<string, Map<string, EntityRecord>>();

  private bucket(table: string): Map<string, EntityRecord> {
    let b = this.tables.get(table);
    if (!b) {
      b = new Map();
      this.tables.set(table, b);
    }
    return b;
  }

  async list(
    d: CollectionDescriptor,
    tenantId: string,
    opts: ListOptions = {},
  ): Promise<ListResult> {
    const page = clampPage(opts.page);
    const limit = clampLimit(opts.limit);

    const filterCols = Object.keys(opts.filter ?? {}).filter((k) => d.coreColumns.includes(k));
    const all = [...this.bucket(d.table).values()]
      .filter((r) => r.tenant_id === tenantId)
      .filter((r) => filterCols.every((c) => r[c] === opts.filter![c]))
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

    const offset = (page - 1) * limit;
    return {
      data: all.slice(offset, offset + limit),
      meta: { total_count: all.length, page, limit },
    };
  }

  async findById(
    d: CollectionDescriptor,
    tenantId: string,
    id: string,
  ): Promise<EntityRecord | null> {
    const rec = this.bucket(d.table).get(id);
    return rec && rec.tenant_id === tenantId ? rec : null;
  }

  async insert(
    d: CollectionDescriptor,
    tenantId: string,
    payload: SplitPayload,
  ): Promise<EntityRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const record: EntityRecord = {
      id,
      tenant_id: tenantId,
      ...payload.core,
      ...payload.extended,
      created_at: now,
      updated_at: now,
    };
    this.bucket(d.table).set(id, record);
    return record;
  }

  async update(
    d: CollectionDescriptor,
    tenantId: string,
    id: string,
    payload: SplitPayload,
  ): Promise<EntityRecord | null> {
    const existing = await this.findById(d, tenantId, id);
    if (!existing) return null;
    const updated: EntityRecord = {
      ...existing,
      ...payload.core,
      ...payload.extended,
      updated_at: new Date().toISOString(),
    };
    this.bucket(d.table).set(id, updated);
    return updated;
  }
}
