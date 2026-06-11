import { describe, expect, it, vi } from 'vitest';
import { MockRegistry } from '@ops/compiler';
import { InMemoryCacheStore } from '../services/cache-store';
import { InMemoryTenantFieldStore } from '../services/tenant-field-store';
import { SchemaRegistryService, EntityNotFoundError } from '../services/schema-registry.service';
import { SchemaBuilderService } from '../services/schema-builder.service';

// Phase 1b — Schema Builder 409-conflict + PUT update (spec §3.3).

const TENANT = '00000000-0000-0000-0000-000000000001';

function build() {
  const registry = new MockRegistry();
  const tenantFields = new InMemoryTenantFieldStore();
  const schemaRegistry = new SchemaRegistryService(registry, tenantFields, new InMemoryCacheStore(), {
    keyPrefix: 'test',
  });
  const builder = new SchemaBuilderService(registry, tenantFields, schemaRegistry);
  return { registry, tenantFields, schemaRegistry, builder };
}

describe('SchemaBuilderService.addField', () => {
  it('creates a new Tier 2 field (is_system forced false) and invalidates the cache', async () => {
    const { builder, schemaRegistry, tenantFields } = build();
    const invalidate = vi.spyOn(schemaRegistry, 'invalidate');

    const result = await builder.addField(TENANT, 'people', {
      name: 'cost_center',
      field_type: 'string',
      is_required: true,
      sort_order: 150,
    });

    expect(result.status).toBe('created');
    if (result.status === 'created') {
      expect(result.field.is_system).toBe(false);
      expect(result.field.is_required).toBe(true);
    }
    expect(await tenantFields.find(TENANT, 'people', 'cost_center')).not.toBeNull();
    expect(invalidate).toHaveBeenCalledWith(TENANT, 'people');
  });

  it('409s when the name collides with a platform field', async () => {
    const { builder } = build();
    const result = await builder.addField(TENANT, 'people', { name: 'email', field_type: 'string' });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.reason).toBe('platform_field');
      expect(result.existing.name).toBe('email');
    }
  });

  it('409s when the tenant field already exists', async () => {
    const { builder } = build();
    await builder.addField(TENANT, 'people', { name: 'cost_center', field_type: 'string' });
    const again = await builder.addField(TENANT, 'people', { name: 'cost_center', field_type: 'number' });
    expect(again.status).toBe('conflict');
    if (again.status === 'conflict') expect(again.reason).toBe('tenant_field');
  });

  it('throws EntityNotFoundError for an unknown entity', async () => {
    const { builder } = build();
    await expect(
      builder.addField(TENANT, 'unicorn', { name: 'x', field_type: 'string' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('isolates fields per tenant', async () => {
    const { builder } = build();
    const other = '00000000-0000-0000-0000-0000000000ff';
    await builder.addField(TENANT, 'people', { name: 'cost_center', field_type: 'string' });
    const result = await builder.addField(other, 'people', { name: 'cost_center', field_type: 'string' });
    expect(result.status).toBe('created');
  });
});

describe('SchemaBuilderService.updateField', () => {
  it('updates an existing Tier 2 field and invalidates the cache', async () => {
    const { builder, schemaRegistry } = build();
    await builder.addField(TENANT, 'people', { name: 'cost_center', field_type: 'string', pii: false });
    const invalidate = vi.spyOn(schemaRegistry, 'invalidate');

    const result = await builder.updateField(TENANT, 'people', 'cost_center', {
      field_type: 'string',
      pii: true,
      label: 'Cost Center',
    });
    expect(result.status).toBe('updated');
    if (result.status === 'updated') {
      expect(result.field.pii).toBe(true);
      expect(result.field.label).toBe('Cost Center');
      expect(result.field.is_system).toBe(false);
    }
    expect(invalidate).toHaveBeenCalledWith(TENANT, 'people');
  });

  it('404s when the tenant field does not exist', async () => {
    const { builder } = build();
    const result = await builder.updateField(TENANT, 'people', 'ghost', { field_type: 'string' });
    expect(result.status).toBe('not_found');
  });

  it('409s when trying to modify a platform field', async () => {
    const { builder } = build();
    const result = await builder.updateField(TENANT, 'people', 'email', { field_type: 'string' });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.reason).toBe('platform_field');
  });
});
