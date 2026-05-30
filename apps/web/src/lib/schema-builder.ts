import type { PlatformField } from '@ops/shared';

// Phase 1b — Schema Builder shared constants + pure helpers.
//
// There is no "list entities" endpoint yet, so we present the two known registry entities as
// the selectable set. The `:entity` path segment is the registry ENTITY NAME (not the
// resource/collection).
// TODO: replace with an entities list endpoint when one exists.
export const SCHEMA_ENTITIES: { entity: string; label: string }[] = [
  { entity: 'people', label: 'Employees' },
  { entity: 'leave_requests', label: 'Leave Requests' },
];

// Valid field_type values accepted by the Schema Builder API (add-field body).
export const FIELD_TYPES = ['string', 'text', 'number', 'boolean', 'date', 'uuid'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  string: 'Short text',
  text: 'Long text',
  number: 'Number',
  boolean: 'Yes / No',
  date: 'Date',
  uuid: 'Reference (UUID)',
};

/** Stable sort for the merged field list: by sort_order, then name. Pure. */
export function sortFields(fields: PlatformField[]): PlatformField[] {
  return [...fields].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

/**
 * Operator-friendly copy for a 409 conflict (no raw JSON / status codes), keyed off the
 * `reason` returned by the API. Pure — unit tested.
 *
 * - `platform_field`: the name collides with a Tier 1 platform field. It can never be
 *   shadowed or edited.
 * - `tenant_field`: a Tier 2 field with this name already exists; the operator should edit it
 *   instead of adding a new one.
 */
export function conflictMessage(reason: 'platform_field' | 'tenant_field' | undefined): string {
  switch (reason) {
    case 'platform_field':
      return 'This name belongs to a built-in platform field and cannot be reused. Choose a different name.';
    case 'tenant_field':
      return 'A field with this name already exists. To change it, edit the existing field instead.';
    default:
      return 'A field with this name already exists.';
  }
}
