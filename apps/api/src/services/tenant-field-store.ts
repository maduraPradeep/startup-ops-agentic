import { PlatformFieldSchema, type PlatformField } from '@ops/shared';
import type { SupabaseClient } from '../db/supabase-client';

// Phase 1b — Tier 2 tenant field extensions (spec §3.3).
//
// The Schema Builder writes tenant-specific field definitions and /describe merges
// them on top of the platform (Tier 1) fields. SchemaRegistryService / SchemaBuilderService
// depend only on this interface so they are unit-tested with the in-memory store and
// wired to Postgres in production. Tenant fields are ALWAYS Tier 2 (is_system = false).

export interface TenantFieldStore {
  list(tenantId: string, entityName: string): Promise<PlatformField[]>;
  find(tenantId: string, entityName: string, name: string): Promise<PlatformField | null>;
  insert(tenantId: string, entityName: string, field: PlatformField): Promise<void>;
  update(tenantId: string, entityName: string, name: string, field: PlatformField): Promise<void>;
}

interface TenantFieldRow {
  name: string;
  label: string | null;
  field_type: string;
  is_required: boolean;
  is_system: boolean;
  pii: boolean;
  sort_order: number;
}

function rowToField(row: TenantFieldRow): PlatformField {
  const base: Record<string, unknown> = {
    name: row.name,
    field_type: row.field_type,
    is_required: row.is_required,
    is_system: false, // tenant fields are always Tier 2
    pii: row.pii,
    sort_order: row.sort_order,
  };
  if (row.label !== null && row.label !== undefined) base.label = row.label;
  return PlatformFieldSchema.parse(base);
}

/** Postgres-backed store over the `tenant_field_definitions` table. */
export class PostgresTenantFieldStore implements TenantFieldStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(tenantId: string, entityName: string): Promise<PlatformField[]> {
    const rows = await this.client.query<TenantFieldRow>(
      `SELECT name, label, field_type, is_required, is_system, pii, sort_order
         FROM tenant_field_definitions
        WHERE tenant_id = $1 AND entity_name = $2
        ORDER BY sort_order, name`,
      [tenantId, entityName],
    );
    return rows.map(rowToField);
  }

  async find(tenantId: string, entityName: string, name: string): Promise<PlatformField | null> {
    const rows = await this.client.query<TenantFieldRow>(
      `SELECT name, label, field_type, is_required, is_system, pii, sort_order
         FROM tenant_field_definitions
        WHERE tenant_id = $1 AND entity_name = $2 AND name = $3`,
      [tenantId, entityName, name],
    );
    return rows[0] ? rowToField(rows[0]) : null;
  }

  async insert(tenantId: string, entityName: string, field: PlatformField): Promise<void> {
    await this.client.query(
      `INSERT INTO tenant_field_definitions
         (tenant_id, entity_name, name, label, field_type, is_required, is_system, pii, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8)`,
      [
        tenantId,
        entityName,
        field.name,
        field.label ?? null,
        field.field_type,
        field.is_required,
        field.pii,
        field.sort_order,
      ],
    );
  }

  async update(tenantId: string, entityName: string, name: string, field: PlatformField): Promise<void> {
    await this.client.query(
      `UPDATE tenant_field_definitions
          SET label = $4, field_type = $5, is_required = $6, pii = $7, sort_order = $8, updated_at = NOW()
        WHERE tenant_id = $1 AND entity_name = $2 AND name = $3`,
      [
        tenantId,
        entityName,
        name,
        field.label ?? null,
        field.field_type,
        field.is_required,
        field.pii,
        field.sort_order,
      ],
    );
  }
}

/** Process-local store — the test/dev fallback when no DB is configured. */
export class InMemoryTenantFieldStore implements TenantFieldStore {
  // keyed by `${tenantId}:${entityName}`
  private readonly store = new Map<string, Map<string, PlatformField>>();

  private bucket(tenantId: string, entityName: string): Map<string, PlatformField> {
    const key = `${tenantId}:${entityName}`;
    let b = this.store.get(key);
    if (!b) {
      b = new Map();
      this.store.set(key, b);
    }
    return b;
  }

  async list(tenantId: string, entityName: string): Promise<PlatformField[]> {
    return [...this.bucket(tenantId, entityName).values()].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
  }

  async find(tenantId: string, entityName: string, name: string): Promise<PlatformField | null> {
    return this.bucket(tenantId, entityName).get(name) ?? null;
  }

  async insert(tenantId: string, entityName: string, field: PlatformField): Promise<void> {
    this.bucket(tenantId, entityName).set(field.name, { ...field, is_system: false });
  }

  async update(tenantId: string, entityName: string, name: string, field: PlatformField): Promise<void> {
    this.bucket(tenantId, entityName).set(name, { ...field, is_system: false });
  }
}
