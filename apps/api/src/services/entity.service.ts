import type { PlatformField } from '@ops/shared';
import type { SchemaRegistryService, DescribeResult } from './schema-registry.service';
import { EntityNotFoundError } from './schema-registry.service';
import type {
  CollectionDescriptor,
  EntityRecord,
  EntityStore,
  ListOptions,
  ListResult,
  SplitPayload,
} from './entity-store';

// Phase 1b — Entity System (spec §3.6, §6). Replaces the legacy Directus-backed
// EntityModel: CRUD over the per-tenant Postgres tables, registry-driven.
//
// The merged /describe field set (Tier 1 platform + Tier 2 tenant) is the single source
// of truth for what may be written: Tier 1 system fields map to typed columns, Tier 2
// fields go into `extended_data` JSONB, and anything else is rejected. This keeps the
// entity surface in lockstep with the Schema Builder without a second schema definition.

/** System columns managed by the DB, never accepted from request input. */
const AUTO_MANAGED = new Set(['id', 'tenant_id', 'created_at', 'updated_at']);

/** Physical mapping for the storable, registry-backed collections (spec §3.6). */
const STORABLE: Record<string, { entity: string; table: string }> = {
  employees: { entity: 'people', table: 'employees' },
  leave_requests: { entity: 'leave_requests', table: 'leave_requests' },
};

export class EntityValidationError extends Error {
  constructor(
    message: string,
    public readonly fields: string[] = [],
  ) {
    super(message);
    this.name = 'EntityValidationError';
  }
}

export class RecordNotFoundError extends Error {
  constructor(
    public readonly collection: string,
    public readonly id: string,
  ) {
    super(`No ${collection} record with id ${id}`);
    this.name = 'RecordNotFoundError';
  }
}

export class EntityService {
  constructor(
    private readonly schemaRegistry: SchemaRegistryService,
    private readonly store: EntityStore,
  ) {}

  /** True for collections this service can persist (others fall through to legacy/404). */
  static isStorable(collection: string): boolean {
    return collection in STORABLE;
  }

  private mapping(collection: string): { entity: string; table: string } {
    const m = STORABLE[collection];
    if (!m) throw new EntityNotFoundError(collection);
    return m;
  }

  /** Build the storage descriptor from the merged describe (registry-driven columns). */
  private async describeFor(
    tenantId: string,
    collection: string,
  ): Promise<{ descriptor: CollectionDescriptor; describe: DescribeResult }> {
    const { entity, table } = this.mapping(collection);
    const describe = await this.schemaRegistry.describe(tenantId, entity);
    const coreColumns = describe.fields
      .filter((f) => f.is_system && !AUTO_MANAGED.has(f.name))
      .map((f) => f.name);
    return { descriptor: { collection, entity, table, coreColumns }, describe };
  }

  /** Tier1 + Tier2 merged field set for the collection (spec §3.5). */
  async describe(tenantId: string, collection: string): Promise<DescribeResult> {
    const { describe } = await this.describeFor(tenantId, collection);
    return describe;
  }

  async list(tenantId: string, collection: string, opts?: ListOptions): Promise<ListResult> {
    const { descriptor } = await this.describeFor(tenantId, collection);
    return this.store.list(descriptor, tenantId, opts);
  }

  async get(tenantId: string, collection: string, id: string): Promise<EntityRecord> {
    const { descriptor } = await this.describeFor(tenantId, collection);
    const record = await this.store.findById(descriptor, tenantId, id);
    if (!record) throw new RecordNotFoundError(collection, id);
    return record;
  }

  async create(
    tenantId: string,
    collection: string,
    body: Record<string, unknown>,
  ): Promise<EntityRecord> {
    const { descriptor, describe } = await this.describeFor(tenantId, collection);
    const payload = this.validateAndSplit(describe, descriptor, body, { partial: false });
    return this.store.insert(descriptor, tenantId, payload);
  }

  async update(
    tenantId: string,
    collection: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<EntityRecord> {
    const { descriptor, describe } = await this.describeFor(tenantId, collection);
    const payload = this.validateAndSplit(describe, descriptor, body, { partial: true });
    const record = await this.store.update(descriptor, tenantId, id, payload);
    if (!record) throw new RecordNotFoundError(collection, id);
    return record;
  }

  /**
   * Validate request input against the merged field set and split it into typed core
   * columns vs Tier 2 `extended_data`. Rejects unknown/auto-managed keys; on a full
   * (non-partial) write, requires every required, non-auto-managed field.
   */
  private validateAndSplit(
    describe: DescribeResult,
    descriptor: CollectionDescriptor,
    body: Record<string, unknown>,
    opts: { partial: boolean },
  ): SplitPayload {
    const byName = new Map(describe.fields.map((f) => [f.name, f]));
    const coreSet = new Set(descriptor.coreColumns);

    const unknown: string[] = [];
    const core: Record<string, unknown> = {};
    const extended: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(body)) {
      const field = byName.get(key);
      if (!field || AUTO_MANAGED.has(key)) {
        unknown.push(key);
        continue;
      }
      const value = coerce(field, raw);
      if (coreSet.has(key)) core[key] = value;
      else extended[key] = value;
    }

    if (unknown.length > 0) {
      throw new EntityValidationError(`Unknown field(s): ${unknown.join(', ')}`, unknown);
    }

    if (!opts.partial) {
      const missing = describe.fields
        .filter((f) => f.is_required && !AUTO_MANAGED.has(f.name))
        .map((f) => f.name)
        .filter((name) => body[name] === undefined || body[name] === null);
      if (missing.length > 0) {
        throw new EntityValidationError(`Missing required field(s): ${missing.join(', ')}`, missing);
      }
    }

    return { core, extended };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Light, type-aware coercion/validation for a single field value. */
function coerce(field: PlatformField, raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  switch (field.field_type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) throw new EntityValidationError(`Field "${field.name}" must be a number`, [field.name]);
      return n;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new EntityValidationError(`Field "${field.name}" must be a boolean`, [field.name]);
    }
    case 'uuid': {
      if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
        throw new EntityValidationError(`Field "${field.name}" must be a UUID`, [field.name]);
      }
      return raw;
    }
    case 'date': {
      const d = new Date(raw as string);
      if (Number.isNaN(d.getTime())) {
        throw new EntityValidationError(`Field "${field.name}" must be a date`, [field.name]);
      }
      return raw; // keep the original representation for the driver
    }
    default:
      return raw; // string / text / unconstrained
  }
}
