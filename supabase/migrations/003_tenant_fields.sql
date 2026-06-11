-- Phase 1b — 003_tenant_fields.sql
-- Tenant field extensions (Tier 2 / spec §3.3). A tenant admin extends a platform
-- entity with custom fields; these are merged with platform_fields by /describe.
-- The unique constraint prevents two definitions of the same field on the same
-- (tenant, entity) and is the basis of the Schema Builder 409-conflict response.

CREATE TABLE IF NOT EXISTS tenant_field_definitions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_name VARCHAR(100) NOT NULL REFERENCES entity_definitions(name) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  label       VARCHAR(200),
  field_type  VARCHAR(50)  NOT NULL,
  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  is_system   BOOLEAN      NOT NULL DEFAULT FALSE, -- always Tier 2
  pii         BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order  INTEGER      NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- spec §3.3: one definition of a given field name per tenant+entity.
  UNIQUE (tenant_id, entity_name, name)
);
CREATE INDEX IF NOT EXISTS idx_tenant_fields_tenant_entity
  ON tenant_field_definitions(tenant_id, entity_name);
