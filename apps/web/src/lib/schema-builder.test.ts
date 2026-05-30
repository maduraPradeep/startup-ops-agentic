import { describe, it, expect } from 'vitest';
import type { PlatformField } from '@ops/shared';
import { sortFields, conflictMessage } from './schema-builder';

const field = (over: Partial<PlatformField>): PlatformField => ({
  name: 'f',
  field_type: 'string',
  is_required: false,
  is_system: false,
  pii: false,
  sort_order: 100,
  ...over,
});

describe('sortFields', () => {
  it('orders by sort_order then name, without mutating the input', () => {
    const input = [
      field({ name: 'b', sort_order: 100 }),
      field({ name: 'a', sort_order: 100 }),
      field({ name: 'z', sort_order: 10 }),
    ];
    const out = sortFields(input);
    expect(out.map((f) => f.name)).toEqual(['z', 'a', 'b']);
    // input untouched (pure)
    expect(input.map((f) => f.name)).toEqual(['b', 'a', 'z']);
  });
});

describe('conflictMessage', () => {
  it('explains a platform-field collision without leaking codes', () => {
    expect(conflictMessage('platform_field')).toMatch(/built-in platform field/i);
  });
  it('points the operator at editing for a tenant-field collision', () => {
    expect(conflictMessage('tenant_field')).toMatch(/edit the existing field/i);
  });
  it('falls back to a generic message for an unknown reason', () => {
    expect(conflictMessage(undefined)).toMatch(/already exists/i);
  });
});
