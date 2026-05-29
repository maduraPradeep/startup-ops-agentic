import { PlatformFieldSchema, type PlatformField } from '@ops/shared';
import type { Registry } from '@ops/compiler';
import type { TenantFieldStore } from './tenant-field-store';
import type { SchemaRegistryService } from './schema-registry.service';
import { EntityNotFoundError } from './schema-registry.service';

// Phase 1b — Schema Builder (spec §3.3). A tenant admin adds Tier 2 field extensions.
//
// addField returns a 409-style conflict when the field name already exists — either as a
// platform (Tier 1) field, which can never be shadowed, or as an existing tenant field,
// which must be changed via updateField (PUT). Every successful mutation invalidates the
// SchemaRegistryService cache so the next /describe reflects it.

/** Caller-supplied field spec. is_system is fixed to false (Tier 2) by the service. */
export interface FieldInput {
  name: string;
  label?: string;
  field_type: string;
  is_required?: boolean;
  pii?: boolean;
  sort_order?: number;
}

export type AddFieldResult =
  | { status: 'created'; field: PlatformField }
  | { status: 'conflict'; reason: 'platform_field' | 'tenant_field'; existing: PlatformField };

export type UpdateFieldResult =
  | { status: 'updated'; field: PlatformField }
  | { status: 'not_found' }
  | { status: 'conflict'; reason: 'platform_field'; existing: PlatformField };

export class SchemaBuilderService {
  constructor(
    private readonly registry: Registry,
    private readonly tenantFields: TenantFieldStore,
    private readonly schemaRegistry: SchemaRegistryService,
  ) {}

  private requireEntity(entityName: string): void {
    if (!this.registry.getEntity(entityName)) {
      throw new EntityNotFoundError(entityName);
    }
  }

  private platformField(entityName: string, name: string): PlatformField | null {
    return this.registry.getEntityFields(entityName).find((f) => f.name === name) ?? null;
  }

  private normalize(input: FieldInput): PlatformField {
    return PlatformFieldSchema.parse({
      name: input.name,
      label: input.label,
      field_type: input.field_type,
      is_required: input.is_required ?? false,
      is_system: false, // Tier 2 always
      pii: input.pii ?? false,
      sort_order: input.sort_order ?? 100,
    });
  }

  /** POST: create a Tier 2 field; 409 if the name collides with a platform or tenant field. */
  async addField(tenantId: string, entityName: string, input: FieldInput): Promise<AddFieldResult> {
    this.requireEntity(entityName);

    const platform = this.platformField(entityName, input.name);
    if (platform) {
      return { status: 'conflict', reason: 'platform_field', existing: platform };
    }

    const existingTenant = await this.tenantFields.find(tenantId, entityName, input.name);
    if (existingTenant) {
      return { status: 'conflict', reason: 'tenant_field', existing: existingTenant };
    }

    const field = this.normalize(input);
    await this.tenantFields.insert(tenantId, entityName, field);
    await this.schemaRegistry.invalidate(tenantId, entityName);
    return { status: 'created', field };
  }

  /** PUT: update an existing Tier 2 field. Platform fields are immutable; absent fields 404. */
  async updateField(
    tenantId: string,
    entityName: string,
    name: string,
    input: Omit<FieldInput, 'name'>,
  ): Promise<UpdateFieldResult> {
    this.requireEntity(entityName);

    const platform = this.platformField(entityName, name);
    if (platform) {
      return { status: 'conflict', reason: 'platform_field', existing: platform };
    }

    const existing = await this.tenantFields.find(tenantId, entityName, name);
    if (!existing) {
      return { status: 'not_found' };
    }

    const field = this.normalize({ ...input, name });
    await this.tenantFields.update(tenantId, entityName, name, field);
    await this.schemaRegistry.invalidate(tenantId, entityName);
    return { status: 'updated', field };
  }
}
