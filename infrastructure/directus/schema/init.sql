-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tenants ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  plan       VARCHAR(50)  DEFAULT 'starter',
  settings   JSONB        DEFAULT '{}',
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Departments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(200) NOT NULL,
  head       UUID
);

-- ── Employees ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              VARCHAR(200) NOT NULL,
  email             VARCHAR(320) NOT NULL,
  role              VARCHAR(200) NOT NULL,
  department        UUID REFERENCES departments(id),
  manager           UUID REFERENCES employees(id),
  employment_status VARCHAR(50)  DEFAULT 'active',
  employment_type   VARCHAR(50)  DEFAULT 'full_time',
  start_date        DATE         NOT NULL,
  location          VARCHAR(200),
  skills            JSONB        DEFAULT '[]',
  slack_id          VARCHAR(100),
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- ── Leave Policies ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 VARCHAR(200) NOT NULL,
  leave_type           VARCHAR(50)  NOT NULL,
  max_days_per_year    INTEGER,
  requires_approval    BOOLEAN      DEFAULT TRUE,
  notice_days_required INTEGER      DEFAULT 0,
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Leave Requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee       UUID NOT NULL REFERENCES employees(id),
  policy         UUID NOT NULL REFERENCES leave_policies(id),
  leave_type     VARCHAR(50)   NOT NULL,
  start_date     DATE          NOT NULL,
  end_date       DATE          NOT NULL,
  days_requested DECIMAL(5,2),
  reason         TEXT,
  status         VARCHAR(50)   DEFAULT 'draft',
  approver       UUID REFERENCES employees(id),
  approved_at    TIMESTAMPTZ,
  approval_notes TEXT,
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW()
);

-- ── Projects ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  status      VARCHAR(50)  DEFAULT 'planning',
  owner       UUID NOT NULL REFERENCES employees(id),
  department  UUID REFERENCES departments(id),
  start_date  DATE,
  end_date    DATE,
  budget      DECIMAL(15,2),
  tags        JSONB        DEFAULT '[]',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL,
  content     TEXT,
  category    VARCHAR(100),
  tags        JSONB        DEFAULT '[]',
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  -- pgvector embedding for semantic search
  embedding   vector(1536)
);

-- ── Approval Chains ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_chains (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title             VARCHAR(500),
  description       TEXT,
  status            VARCHAR(50)  DEFAULT 'pending',
  approver          UUID REFERENCES employees(id),
  approval_notes    TEXT,
  decided_at        TIMESTAMPTZ,
  decided_by        UUID,
  deadline          TIMESTAMPTZ,
  entity_collection VARCHAR(100),
  entity_id         UUID,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Audit Logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id     UUID NOT NULL,
  actor_email  VARCHAR(320) NOT NULL,
  action       VARCHAR(200) NOT NULL,
  collection   VARCHAR(100) NOT NULL,
  item_id      UUID,
  changes      JSONB,
  metadata     JSONB,
  timestamp    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Conversations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  title      VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_tenant        ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant   ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status   ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_chains_tenant  ON approval_chains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_status  ON approval_chains(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant       ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant    ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_embedding     ON documents USING ivfflat (embedding vector_cosine_ops);

-- ── Dev seed ──────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme')
ON CONFLICT DO NOTHING;
