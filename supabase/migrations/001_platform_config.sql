-- Phase 1b — 001_platform_config.sql
-- Canonical platform-config tables (the no-Directus replacement). These mirror the
-- @ops/shared registry shapes (packages/shared/src/schemas/registry.ts) so that
-- PostgresRegistry can hydrate the exact same EntityDefinition / ToolRegistryEntry /
-- AgentDefinition / RoleDefinition objects MockRegistry serves from fixtures.
--
-- Platform config is global (Tier 1): it is NOT tenant-scoped. Tenant field
-- extensions (Tier 2) live in 003_tenant_fields.sql.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tenants ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  plan       VARCHAR(50)  DEFAULT 'starter',
  settings   JSONB        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Entity definitions (EntityDefinitionSchema) ─────────────────────────────────
-- name = token name (e.g. "people"); resource = scope/permission key (e.g. "employees").
CREATE TABLE IF NOT EXISTS entity_definitions (
  name       VARCHAR(100) PRIMARY KEY,
  label      VARCHAR(200) NOT NULL,
  resource   VARCHAR(100) NOT NULL,
  tool_ops   JSONB        NOT NULL DEFAULT '[]', -- string[]
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Platform fields (PlatformFieldSchema) ───────────────────────────────────────
-- Tier 1 (is_system = true) platform-owned fields. Tenant extensions (Tier 2,
-- is_system = false) are sourced from tenant_field_definitions in 003 and merged
-- by /describe; the seed also records the Phase 1a tenant-extension fixtures here
-- so registry parity with MockRegistry holds exactly.
CREATE TABLE IF NOT EXISTS platform_fields (
  entity_name VARCHAR(100) NOT NULL REFERENCES entity_definitions(name) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  label       VARCHAR(200),
  field_type  VARCHAR(50)  NOT NULL,
  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  is_system   BOOLEAN      NOT NULL DEFAULT TRUE,
  pii         BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order  INTEGER      NOT NULL DEFAULT 100,
  PRIMARY KEY (entity_name, name)
);
CREATE INDEX IF NOT EXISTS idx_platform_fields_entity ON platform_fields(entity_name);

-- ── Tool registry (ToolRegistryEntrySchema) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_registry (
  name          VARCHAR(100) PRIMARY KEY,
  label         VARCHAR(200),
  pii_safe      BOOLEAN NOT NULL,
  is_destructive BOOLEAN NOT NULL,
  input_schema  JSONB,
  output_schema JSONB
);

-- ── Agent definitions (AgentDefinitionSchema) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_definitions (
  name        VARCHAR(100) PRIMARY KEY,
  label       VARCHAR(200) NOT NULL,
  tool_scopes JSONB        NOT NULL DEFAULT '[]', -- string[]
  step_types  JSONB        NOT NULL DEFAULT '[]'  -- string[]
);

-- ── Roles (RoleDefinitionSchema) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  name        VARCHAR(100) PRIMARY KEY,
  permissions JSONB NOT NULL DEFAULT '[]' -- string[]
);

-- ── Default skills (platform-shipped skill templates) ───────────────────────────
CREATE TABLE IF NOT EXISTS default_skills (
  name        VARCHAR(150) PRIMARY KEY,
  label       VARCHAR(200) NOT NULL,
  skill_text  TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
