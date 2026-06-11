-- Phase 1b — 002_entities.sql
-- Tenant-scoped entity storage (JSONB hybrid, spec §3.6): typed core columns +
-- extended_data JSONB for tenant field extensions, with a GIN index. RLS is added
-- in 005_rls_policies.sql.

-- ── Departments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  head          UUID,
  extended_data JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Employees (entity_definitions.name = "people") ──────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  email           VARCHAR(320) NOT NULL,
  role            VARCHAR(200) NOT NULL,
  department_id   UUID REFERENCES departments(id),
  manager_id      UUID REFERENCES employees(id),
  start_date      DATE NOT NULL,
  employment_type VARCHAR(50) DEFAULT 'full_time',
  slack_id        VARCHAR(100),
  extended_data   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- ── Leave policies ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 VARCHAR(200) NOT NULL,
  leave_type           VARCHAR(50)  NOT NULL,
  max_days_per_year    INTEGER,
  requires_approval    BOOLEAN DEFAULT TRUE,
  notice_days_required INTEGER DEFAULT 0,
  extended_data        JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Leave requests (entity_definitions.name = "leave_requests") ─────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  type          VARCHAR(50) NOT NULL,
  status        VARCHAR(50) DEFAULT 'draft',
  reason        TEXT,
  extended_data JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_departments_tenant      ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant        ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_policies_tenant   ON leave_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant   ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status   ON leave_requests(status);

-- GIN indexes on the JSONB extension column (spec §3.6).
CREATE INDEX IF NOT EXISTS idx_employees_extended      ON employees      USING gin (extended_data);
CREATE INDEX IF NOT EXISTS idx_departments_extended    ON departments    USING gin (extended_data);
CREATE INDEX IF NOT EXISTS idx_leave_policies_extended ON leave_policies USING gin (extended_data);
CREATE INDEX IF NOT EXISTS idx_leave_requests_extended ON leave_requests USING gin (extended_data);
