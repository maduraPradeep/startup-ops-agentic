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
  blackout_dates       JSONB        DEFAULT '[]',
  status               VARCHAR(50)  DEFAULT 'active',
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Leave Requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee       UUID NOT NULL REFERENCES employees(id),
  policy         UUID REFERENCES leave_policies(id),
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

-- ── Conversation Messages (persisted chat history) ────────────
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role            VARCHAR(20)  NOT NULL CHECK (role IN ('human', 'agent')),
  content         TEXT         NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Workflow Definitions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  trigger     JSONB NOT NULL,
  prompt      TEXT NOT NULL,
  entities    JSONB DEFAULT '[]',
  output      JSONB NOT NULL,
  status      VARCHAR(50) DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Workflows (LangGraph runtime state) ──────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id   VARCHAR(100) UNIQUE NOT NULL,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(300) NOT NULL,
  current_state VARCHAR(100) NOT NULL,
  progress      INTEGER      DEFAULT 0,
  history       JSONB        DEFAULT '[]',
  participants  JSONB        DEFAULT '[]',
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_tenant               ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant          ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee        ON leave_requests(employee);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status          ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_chains_tenant         ON approval_chains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_status         ON approval_chains(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant              ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant           ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv     ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_workflows_tenant               ON workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflows_workflow_id          ON workflows(workflow_id);
CREATE INDEX IF NOT EXISTS idx_documents_embedding            ON documents USING ivfflat (embedding vector_cosine_ops);

-- ═══════════════════════════════════════════════════════════════
-- Dev Seed Data — Acme Corp
-- Demonstrates: RBAC roles, leave policy enforcement, audit trail,
--               Data Admin UI, and LangGraph workflow persistence.
-- ═══════════════════════════════════════════════════════════════

-- Tenant
INSERT INTO tenants (id, name, slug, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme', 'enterprise')
ON CONFLICT DO NOTHING;

-- Departments
INSERT INTO departments (id, tenant_id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Engineering'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Human Resources'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Operations'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Finance')
ON CONFLICT DO NOTHING;

-- Employees (one per role to showcase RBAC)
-- pw for all dev accounts: password123
INSERT INTO employees (id, tenant_id, name, email, role, department, employment_status, employment_type, start_date, location, skills) VALUES
  -- platform_admin — sees everything, full CRUD on all collections
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Sarah Chen',    'sarah.chen@acme.com',    'platform_admin',  '10000000-0000-0000-0000-000000000002',
   'active', 'full_time', '2019-01-15', 'San Francisco', '["system admin","data governance","security"]'),

  -- hr_admin — CRUD on employees & policies, read leave requests & audit logs
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Marcus Johnson', 'marcus.johnson@acme.com', 'hr_admin',        '10000000-0000-0000-0000-000000000002',
   'active', 'full_time', '2020-03-01', 'New York', '["recruitment","employee relations","payroll"]'),

  -- manager — read employees & leave requests, no create/delete
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Alex Rivera',   'alex.rivera@acme.com',   'manager',          '10000000-0000-0000-0000-000000000001',
   'active', 'full_time', '2020-06-15', 'Austin', '["engineering management","agile","python","react"]'),

  -- department_head — same read access as manager
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Priya Patel',   'priya.patel@acme.com',   'department_head',  '10000000-0000-0000-0000-000000000003',
   'active', 'full_time', '2018-09-10', 'Chicago', '["operations","supply chain","process optimization"]'),

  -- employees — no Data Admin access at all
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'Tom Wilson',    'tom.wilson@acme.com',     'employee',         '10000000-0000-0000-0000-000000000001',
   'active', 'full_time', '2021-02-01', 'Austin', '["typescript","react","node.js"]'),

  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'Emma Davis',    'emma.davis@acme.com',     'employee',         '10000000-0000-0000-0000-000000000001',
   'on_leave', 'full_time', '2021-07-12', 'Remote', '["python","data engineering","spark"]'),

  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   'Raj Kumar',     'raj.kumar@acme.com',      'employee',         '10000000-0000-0000-0000-000000000004',
   'active', 'contractor', '2022-11-01', 'London', '["financial modelling","excel","sql"]')
ON CONFLICT DO NOTHING;

-- Set department heads
UPDATE departments SET head = '20000000-0000-0000-0000-000000000003'
  WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE departments SET head = '20000000-0000-0000-0000-000000000002'
  WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE departments SET head = '20000000-0000-0000-0000-000000000004'
  WHERE id = '10000000-0000-0000-0000-000000000003';

-- Set managers
UPDATE employees SET manager = '20000000-0000-0000-0000-000000000003'
  WHERE id IN ('20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006');
UPDATE employees SET manager = '20000000-0000-0000-0000-000000000004'
  WHERE id = '20000000-0000-0000-0000-000000000007';

-- Leave Policies
-- Demonstrates: max_days_per_year enforcement, notice_days_required, blackout_dates
INSERT INTO leave_policies (id, tenant_id, name, leave_type, max_days_per_year, requires_approval, notice_days_required, blackout_dates, status) VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Annual Leave',  'annual',
   25, TRUE, 14,
   '["2026-12-24","2026-12-25","2026-12-26","2026-12-31","2027-01-01"]',
   'active'),

  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Sick Leave',    'sick',
   10, FALSE, 0,
   '[]',
   'active'),

  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Personal Leave', 'personal',
   5, TRUE, 3,
   '[]',
   'active'),

  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Parental Leave', 'parental',
   90, TRUE, 30,
   '[]',
   'active')
ON CONFLICT DO NOTHING;

-- Leave Requests — various states to populate the admin table
INSERT INTO leave_requests (id, tenant_id, employee, policy, leave_type, start_date, end_date, days_requested, reason, status, approver, approved_at, approval_notes, submitted_at) VALUES
  -- Approved: Tom's annual leave (passes policy — 5 days, 14+ days notice)
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
   'annual', '2026-06-16', '2026-06-20', 5,
   'Summer vacation with family',
   'approved', '20000000-0000-0000-0000-000000000003',
   '2026-05-10 09:00:00+00', 'Approved — project milestone complete before this date.',
   '2026-04-25 10:30:00+00'),

  -- Pending: Emma's personal leave (awaiting manager review)
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003',
   'personal', '2026-06-02', '2026-06-04', 3,
   'Moving to new apartment',
   'pending', NULL, NULL, NULL,
   '2026-05-18 14:00:00+00'),

  -- Rejected: Raj's request that hit the blackout period
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001',
   'annual', '2026-12-22', '2026-12-30', 7,
   'Holiday travel back to India',
   'rejected', '20000000-0000-0000-0000-000000000004',
   '2026-05-15 11:00:00+00', 'Dates overlap company blackout period (Dec 24–26 and Dec 31). Please rebook.',
   '2026-05-14 09:15:00+00'),

  -- Draft: Tom's sick leave (not yet submitted)
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002',
   'sick', '2026-05-20', '2026-05-21', 2,
   'Flu — doctor advised rest',
   'draft', NULL, NULL, NULL, NULL),

  -- Approved: Emma's current on_leave period
  ('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000004',
   'parental', '2026-04-01', '2026-07-01', 65,
   'Parental leave — new baby',
   'approved', '20000000-0000-0000-0000-000000000003',
   '2026-03-01 10:00:00+00', 'Congratulations! Approved.',
   '2026-02-15 16:00:00+00')
ON CONFLICT DO NOTHING;

-- Workflow Definitions — shown in WorkflowBuilderPage list view
INSERT INTO workflow_definitions (id, tenant_id, name, description, trigger, prompt, entities, output, status) VALUES
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Leave Approval Workflow',
   'Automatically validates leave requests against company policies and routes for manager approval.',
   '{"type":"message","config":{"keywords":["leave","vacation","time off","sick","holiday"]}}',
   'When a user requests leave, check @leave_policies for max days and blackout periods. Check @leave_requests for overlapping approved requests from the same employee. If valid, create an approval chain and notify the manager. Respond with clear status.',
   '["leave_policies","leave_requests","employees"]',
   '{"type":"message","config":{}}',
   'active'),

  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Employee Onboarding',
   'Guides HR through onboarding steps when a new employee is created.',
   '{"type":"event","config":{"collection":"employees","action":"create"}}',
   'When a new employee is created in @employees, generate a personalised onboarding checklist: IT setup, access provisioning, team introductions, and first-week schedule. Notify the manager and HR.',
   '["employees","departments"]',
   '{"type":"notification","config":{}}',
   'active'),

  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Monthly Headcount Report',
   'Generates a monthly summary of employee headcount by department.',
   '{"type":"schedule","config":{"cron":"0 8 1 * *"}}',
   'On the first of each month, query @employees grouped by @departments. Include headcount, employment type breakdown, and highlight any status changes from the prior month.',
   '["employees","departments"]',
   '{"type":"message","config":{}}',
   'inactive')
ON CONFLICT DO NOTHING;

-- Audit Logs — showcase the audit trail visible to hr_admin and platform_admin
INSERT INTO audit_logs (id, tenant_id, actor_id, actor_email, action, collection, item_id, changes, metadata, timestamp) VALUES
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', 'marcus.johnson@acme.com',
   'create', 'employees', '20000000-0000-0000-0000-000000000007',
   '{"name":"Raj Kumar","email":"raj.kumar@acme.com","role":"employee","employment_type":"contractor"}',
   '{"note":"Contractor onboarding for Q4 finance project"}',
   '2022-11-01 09:00:00+00'),

  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000003', 'alex.rivera@acme.com',
   'decide', 'approvals', '40000000-0000-0000-0000-000000000001',
   '{"decision":"approved","notes":"Approved — project milestone complete before this date."}',
   '{"approval_id":"40000000-0000-0000-0000-000000000001","employee":"tom.wilson@acme.com"}',
   '2026-05-10 09:00:00+00'),

  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004', 'priya.patel@acme.com',
   'decide', 'approvals', '40000000-0000-0000-0000-000000000003',
   '{"decision":"rejected","notes":"Dates overlap company blackout period."}',
   '{"approval_id":"40000000-0000-0000-0000-000000000003","employee":"raj.kumar@acme.com"}',
   '2026-05-15 11:00:00+00'),

  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', 'marcus.johnson@acme.com',
   'update', 'employees', '20000000-0000-0000-0000-000000000006',
   '{"employment_status":"on_leave"}',
   '{"reason":"Parental leave started 2026-04-01"}',
   '2026-04-01 08:30:00+00'),

  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'sarah.chen@acme.com',
   'create', 'leave_policies', '30000000-0000-0000-0000-000000000004',
   '{"name":"Parental Leave","leave_type":"parental","max_days_per_year":90,"notice_days_required":30}',
   '{"note":"Policy added following statutory requirement update"}',
   '2026-01-10 10:15:00+00')
ON CONFLICT DO NOTHING;
