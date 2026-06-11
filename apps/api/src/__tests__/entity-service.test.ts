import { describe, expect, it } from 'vitest';
import { MockRegistry } from '@ops/compiler';
import { InMemoryCacheStore } from '../services/cache-store';
import { InMemoryTenantFieldStore } from '../services/tenant-field-store';
import { SchemaRegistryService } from '../services/schema-registry.service';
import { EntityNotFoundError } from '../services/schema-registry.service';
import { InMemoryEntityStore } from '../services/entity-store';
import {
  EntityService,
  EntityValidationError,
  RecordNotFoundError,
} from '../services/entity.service';

// Phase 1b — Entity System: registry-driven CRUD with the JSONB-hybrid split (spec §3.6, §6).

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-0000000000ff';
const DEPT = '11111111-1111-1111-1111-111111111111';

function build() {
  const registry = new MockRegistry();
  const tenantFields = new InMemoryTenantFieldStore();
  const schemaRegistry = new SchemaRegistryService(registry, tenantFields, new InMemoryCacheStore(), {
    keyPrefix: 'test',
  });
  const store = new InMemoryEntityStore();
  const entities = new EntityService(schemaRegistry, store);
  return { registry, tenantFields, schemaRegistry, store, entities };
}

const VALID_EMPLOYEE = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'Engineer',
  start_date: '2024-01-15',
};

describe('EntityService.create', () => {
  it('persists typed core columns and assigns id/tenant_id', async () => {
    const { entities } = build();
    const rec = await entities.create(TENANT, 'employees', VALID_EMPLOYEE);

    expect(rec.id).toBeDefined();
    expect(rec.tenant_id).toBe(TENANT);
    expect(rec.name).toBe('Ada Lovelace');
    expect(rec.email).toBe('ada@example.com');
  });

  it('routes Tier 2 fields into extended_data and returns them flattened', async () => {
    const { entities } = build();
    const rec = await entities.create(TENANT, 'employees', {
      ...VALID_EMPLOYEE,
      linkedin_summary: 'Pioneer of computing',
    });
    // Tier 2 field is round-tripped on the flattened record...
    expect(rec.linkedin_summary).toBe('Pioneer of computing');
    // ...and re-fetch confirms it persisted via the extended_data path.
    const again = await entities.get(TENANT, 'employees', rec.id);
    expect(again.linkedin_summary).toBe('Pioneer of computing');
  });

  it('rejects a missing required field', async () => {
    const { entities } = build();
    await expect(
      entities.create(TENANT, 'employees', { name: 'No Email', role: 'X', start_date: '2024-01-01' }),
    ).rejects.toBeInstanceOf(EntityValidationError);
  });

  it('rejects an unknown field', async () => {
    const { entities } = build();
    await expect(
      entities.create(TENANT, 'employees', { ...VALID_EMPLOYEE, salary: 999 }),
    ).rejects.toBeInstanceOf(EntityValidationError);
  });

  it('rejects a malformed uuid for a uuid field', async () => {
    const { entities } = build();
    await expect(
      entities.create(TENANT, 'employees', { ...VALID_EMPLOYEE, department_id: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(EntityValidationError);
  });

  it('accepts a valid uuid for an optional core column', async () => {
    const { entities } = build();
    const rec = await entities.create(TENANT, 'employees', { ...VALID_EMPLOYEE, department_id: DEPT });
    expect(rec.department_id).toBe(DEPT);
  });

  it('throws EntityNotFoundError for a non-storable collection', async () => {
    const { entities } = build();
    await expect(entities.create(TENANT, 'unicorns', VALID_EMPLOYEE)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });
});

describe('EntityService.get / list', () => {
  it('throws RecordNotFoundError for a missing id', async () => {
    const { entities } = build();
    await expect(entities.get(TENANT, 'employees', DEPT)).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('lists only the calling tenant rows with pagination meta', async () => {
    const { entities } = build();
    await entities.create(TENANT, 'employees', VALID_EMPLOYEE);
    await entities.create(TENANT, 'employees', { ...VALID_EMPLOYEE, email: 'b@example.com' });
    await entities.create(OTHER, 'employees', { ...VALID_EMPLOYEE, email: 'c@example.com' });

    const result = await entities.list(TENANT, 'employees');
    expect(result.data).toHaveLength(2);
    expect(result.meta.total_count).toBe(2);
    expect(result.data.every((r) => r.tenant_id === TENANT)).toBe(true);
  });

  it('applies an equality filter on a core column', async () => {
    const { entities } = build();
    await entities.create(TENANT, 'employees', VALID_EMPLOYEE);
    await entities.create(TENANT, 'employees', { ...VALID_EMPLOYEE, email: 'b@example.com', role: 'Manager' });

    const result = await entities.list(TENANT, 'employees', { filter: { role: 'Manager' } });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].email).toBe('b@example.com');
  });
});

describe('EntityService.update', () => {
  it('partially updates a core column without requiring all fields', async () => {
    const { entities } = build();
    const created = await entities.create(TENANT, 'employees', VALID_EMPLOYEE);
    const updated = await entities.update(TENANT, 'employees', created.id, { role: 'Lead Engineer' });
    expect(updated.role).toBe('Lead Engineer');
    expect(updated.email).toBe('ada@example.com');
  });

  it('merges a Tier 2 field update into extended_data', async () => {
    const { entities } = build();
    const created = await entities.create(TENANT, 'employees', {
      ...VALID_EMPLOYEE,
      linkedin_summary: 'v1',
    });
    const updated = await entities.update(TENANT, 'employees', created.id, { pronouns: 'she/her' });
    expect(updated.pronouns).toBe('she/her');
    expect(updated.linkedin_summary).toBe('v1');
  });

  it('throws RecordNotFoundError when updating a missing id', async () => {
    const { entities } = build();
    await expect(
      entities.update(TENANT, 'employees', DEPT, { role: 'X' }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});
