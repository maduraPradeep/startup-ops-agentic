-- Phase 1b — 004_skills.sql
-- Skill authoring + compilation persistence (spec §4). skill_compilations stores
-- the @ops/compiler output keyed by compilation_hash (SHA-256 of skill text +
-- sorted resolved token contexts) so an identical re-compile is a cache hit.

CREATE TABLE IF NOT EXISTS skills (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  skill_text  TEXT NOT NULL,
  author_role VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS skill_compilations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_id         UUID REFERENCES skills(id) ON DELETE CASCADE,
  compilation_hash CHAR(64) NOT NULL,           -- 64-hex SHA-256
  success          BOOLEAN  NOT NULL,
  langgraph_def    JSONB,                        -- LangGraphDefinition (on success)
  react_flow_graph JSONB,                        -- React Flow graph (on success)
  warnings         JSONB NOT NULL DEFAULT '[]',
  error            JSONB,                         -- CompilationError (on failure)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, compilation_hash)
);
CREATE INDEX IF NOT EXISTS idx_skill_compilations_hash ON skill_compilations(compilation_hash);

CREATE TABLE IF NOT EXISTS skill_executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compilation_id  UUID REFERENCES skill_compilations(id) ON DELETE CASCADE,
  state           VARCHAR(50) NOT NULL,          -- ExecutionState union value
  context         JSONB NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_skill_executions_tenant ON skill_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_state  ON skill_executions(state);
