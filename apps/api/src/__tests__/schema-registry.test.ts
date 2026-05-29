import { describe, expect, it, vi } from 'vitest';
import { MockRegistry } from '@ops/compiler';
import { InMemoryCacheStore } from '../services/cache-store';
import { InMemoryTenantFieldStore } from '../services/tenant-field-store';
import {
  SchemaRegistryService,
  EntityNotFoundError,
  mergeFields,
} from '../services/schema-registry.service';

// Phase 1b — /describe Tier1+Tier2 merge, L2 cache, single-flight (spec §3.5).

const TENANT = '00000000-0000-0000-0000-000000000001';

function build() {
  const registry = new MockRegistry();
  const tenantFields = new InMemoryTenantFieldStore();
  const cache = new InMemoryCacheStore();
  const service = new SchemaRegistryService(registry, tenantFields, cache, { keyPrefix: 'test' });
  return { registry, tenantFields, cache, service };
}

describe('mergeFields', () => {
  it('sorts platform + tenant fields by sort_order then name and forces tenant is_system=false', () => {
    const merged = mergeFields(
      [
        { name: 'id', field_type: 'uuid', is_required: true, is_system: true, pii: false, sort_order: 1 },
        { name: 'name', field_type: 'string', is_required: true, is_system: true, pii: true, sort_order: 2 },
      ],
      [
        { name: 'cost_center', field_type: 'string', is_required: false, is_system: true, pii: false, sort_order: 50 },
      ],
    );
    expect(merged.map((f) => f.name)).toEqual(['id', 'name', 'cost_center']);
    expect(merged.find((f) => f.name === 'cost_center')?.is_system).toBe(false);
  });
});

describe('SchemaRegistryService.describe', () => {
  it('merges platform + tenant fields with is_system flags', async () => {
    const { service, tenantFields } = build();
    await tenantFields.insert(TENANT, 'people', {
      name: 'cost_center',
      field_type: 'string',
      is_required: false,
      is_system: false,
      pii: false,
      sort_order: 200,
    });

    const result = await service.describe(TENANT, 'people');
    expect(result.entity).toBe('people');
    expect(result.label).toBe('Employees');
    expect(result.resource).toBe('employees');

    const cost = result.fields.find((f) => f.name === 'cost_center');
    expect(cost).toBeDefined();
    expect(cost?.is_system).toBe(false);
    // Platform system field still flagged Tier 1.
    expect(result.fields.find((f) => f.name === 'id')?.is_system).toBe(true);
    // cost_center has the highest sort_order, so it sorts last.
    expect(result.fields.at(-1)?.name).toBe('cost_center');
  });

  it('serves a cache hit without re-reading tenant fields', async () => {
    const { service, tenantFields } = build();
    const spy = vi.spyOn(tenantFields, 'list');

    await service.describe(TENANT, 'people');
    await service.describe(TENANT, 'people');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent identical describes into one build', async () => {
    const { service, tenantFields } = build();
    const spy = vi.spyOn(tenantFields, 'list');

    const [a, b] = await Promise.all([
      service.describe(TENANT, 'people'),
      service.describe(TENANT, 'people'),
    ]);
    expect(a).toEqual(b);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces a rebuild on the next describe', async () => {
    const { service, tenantFields } = build();
    const spy = vi.spyOn(tenantFields, 'list');

    await service.describe(TENANT, 'people');
    await service.invalidate(TENANT, 'people');
    await service.describe(TENANT, 'people');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws EntityNotFoundError for an unknown entity', async () => {
    const { service } = build();
    await expect(service.describe(TENANT, 'unicorn')).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
