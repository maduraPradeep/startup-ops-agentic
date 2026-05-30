-- Phase 1b — seed.sql
-- Seeds the Phase 1a fixtures (ENTITY_FIXTURES, TOOL_FIXTURES, AGENT_FIXTURES,
-- ROLE_FIXTURES from packages/compiler/src/registry/fixtures.ts) as the initial
-- platform-config dataset. This is the source PostgresRegistry reads, and it must
-- reproduce MockRegistry's results exactly — including the Tier 2 tenant-extension
-- fields on "people" (is_system = false), which Phase 1a keeps inline in the
-- entity fixture, so they are seeded into platform_fields here for parity.
--
-- It also seeds a small set of dev-tenant ENTITY DATA (departments, employees,
-- leave policies, leave requests) plus DEFAULT SKILLS and one tenant skill, so the
-- entity CRUD surface, the Schema Builder / Skill Editor UIs, and Phase 1c skill
-- execution have realistic data to run against without manual setup.
--
-- Idempotent: safe to re-run.

-- ── Dev tenant ─────────────────────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════
-- AUTH USERS — one per role so every permission path is testable without a live
-- GoTrue signup flow. app_metadata carries the claims mapGoTrueClaims() reads
-- (role, tenant_id, tenant_name, name). Password for all: Password1!
--
-- UUID alignment: auth user IDs match the corresponding employee row IDs so the
-- dev identity is obvious at a glance. The platform_admin has no employee record.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at,
  -- GoTrue's Go scanner requires empty string, not NULL, for all varchar/text fields
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
) VALUES
  -- platform_admin — no employee record; full platform access
  ('00000000-0000-0000-0000-000000000000',
   'ffff0000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated',
   'admin@acme.test',
   crypt('Password1!', gen_salt('bf')),
   NOW(),
   '{"role":"platform_admin","tenant_id":"00000000-0000-0000-0000-000000000001","tenant_name":"Acme Corp","name":"Platform Admin"}',
   '{}', FALSE, NOW(), NOW(),
   '', '', '', '', '', '', '', ''),
  -- hr_admin → Radia Perlman (People Ops Manager)
  ('00000000-0000-0000-0000-000000000000',
   'bbbb0000-0000-0000-0000-000000000004',
   'authenticated', 'authenticated',
   'radia@acme.test',
   crypt('Password1!', gen_salt('bf')),
   NOW(),
   '{"role":"hr_admin","tenant_id":"00000000-0000-0000-0000-000000000001","tenant_name":"Acme Corp","name":"Radia Perlman"}',
   '{}', FALSE, NOW(), NOW(),
   '', '', '', '', '', '', '', ''),
  -- manager → Ada Lovelace (Engineering Lead)
  ('00000000-0000-0000-0000-000000000000',
   'bbbb0000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated',
   'ada@acme.test',
   crypt('Password1!', gen_salt('bf')),
   NOW(),
   '{"role":"manager","tenant_id":"00000000-0000-0000-0000-000000000001","tenant_name":"Acme Corp","name":"Ada Lovelace"}',
   '{}', FALSE, NOW(), NOW(),
   '', '', '', '', '', '', '', ''),
  -- department_head → Grace Hopper (Senior Engineer)
  ('00000000-0000-0000-0000-000000000000',
   'bbbb0000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated',
   'grace@acme.test',
   crypt('Password1!', gen_salt('bf')),
   NOW(),
   '{"role":"department_head","tenant_id":"00000000-0000-0000-0000-000000000001","tenant_name":"Acme Corp","name":"Grace Hopper"}',
   '{}', FALSE, NOW(), NOW(),
   '', '', '', '', '', '', '', ''),
  -- employee → Alan Turing (Engineer)
  ('00000000-0000-0000-0000-000000000000',
   'bbbb0000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated',
   'alan@acme.test',
   crypt('Password1!', gen_salt('bf')),
   NOW(),
   '{"role":"employee","tenant_id":"00000000-0000-0000-0000-000000000001","tenant_name":"Acme Corp","name":"Alan Turing"}',
   '{}', FALSE, NOW(), NOW(),
   '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- auth.identities — required for email/password sign-in (GoTrue validates these)
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES
  (gen_random_uuid(), 'ffff0000-0000-0000-0000-000000000001', 'admin@acme.test',   'email', '{"sub":"ffff0000-0000-0000-0000-000000000001","email":"admin@acme.test"}',   NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'bbbb0000-0000-0000-0000-000000000004', 'radia@acme.test',   'email', '{"sub":"bbbb0000-0000-0000-0000-000000000004","email":"radia@acme.test"}',   NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'bbbb0000-0000-0000-0000-000000000001', 'ada@acme.test',     'email', '{"sub":"bbbb0000-0000-0000-0000-000000000001","email":"ada@acme.test"}',     NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'bbbb0000-0000-0000-0000-000000000002', 'grace@acme.test',   'email', '{"sub":"bbbb0000-0000-0000-0000-000000000002","email":"grace@acme.test"}',   NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'bbbb0000-0000-0000-0000-000000000003', 'alan@acme.test',    'email', '{"sub":"bbbb0000-0000-0000-0000-000000000003","email":"alan@acme.test"}',    NOW(), NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ── Entity definitions ───────────────────────────────────────────────────────────
INSERT INTO entity_definitions (name, label, resource, tool_ops) VALUES
  ('people', 'Employees', 'employees',
   '["describe","list","get","create","update","terminate"]'),
  ('leave_requests', 'Leave Requests', 'leave_requests',
   '["describe","list","get","create","approve","reject","cancel"]')
ON CONFLICT (name) DO UPDATE
  SET label = EXCLUDED.label, resource = EXCLUDED.resource, tool_ops = EXCLUDED.tool_ops;

-- ── Platform fields ──────────────────────────────────────────────────────────────
-- people (Tier 1 system fields + the two Phase 1a Tier 2 tenant-extension fields).
INSERT INTO platform_fields (entity_name, name, label, field_type, is_required, is_system, pii, sort_order) VALUES
  ('people', 'id',                NULL, 'uuid',   TRUE,  TRUE,  FALSE, 1),
  ('people', 'name',              NULL, 'string', TRUE,  TRUE,  TRUE,  2),
  ('people', 'email',             NULL, 'string', TRUE,  TRUE,  TRUE,  3),
  ('people', 'role',              NULL, 'string', TRUE,  TRUE,  FALSE, 4),
  ('people', 'department_id',     NULL, 'uuid',   FALSE, TRUE,  FALSE, 5),
  ('people', 'manager_id',        NULL, 'uuid',   FALSE, TRUE,  FALSE, 6),
  ('people', 'start_date',        NULL, 'date',   TRUE,  TRUE,  FALSE, 7),
  ('people', 'employment_type',   NULL, 'string', FALSE, TRUE,  FALSE, 8),
  ('people', 'slack_id',          NULL, 'string', FALSE, TRUE,  FALSE, 9),
  ('people', 'linkedin_summary',  NULL, 'string', FALSE, FALSE, FALSE, 100),
  ('people', 'pronouns',          NULL, 'string', FALSE, FALSE, FALSE, 101),
  -- leave_requests (Tier 1)
  ('leave_requests', 'id',          NULL, 'uuid',   TRUE,  TRUE, FALSE, 1),
  ('leave_requests', 'employee_id', NULL, 'uuid',   TRUE,  TRUE, FALSE, 2),
  ('leave_requests', 'start_date',  NULL, 'date',   TRUE,  TRUE, FALSE, 3),
  ('leave_requests', 'end_date',    NULL, 'date',   TRUE,  TRUE, FALSE, 4),
  ('leave_requests', 'type',        NULL, 'string', TRUE,  TRUE, FALSE, 5),
  ('leave_requests', 'status',      NULL, 'string', FALSE, TRUE, FALSE, 6),
  ('leave_requests', 'reason',      NULL, 'text',   FALSE, TRUE, FALSE, 7)
ON CONFLICT (entity_name, name) DO UPDATE SET
  label       = EXCLUDED.label,
  field_type  = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_system   = EXCLUDED.is_system,
  pii         = EXCLUDED.pii,
  sort_order  = EXCLUDED.sort_order;

-- ── Tool registry ─────────────────────────────────────────────────────────────────
INSERT INTO tool_registry (name, label, pii_safe, is_destructive) VALUES
  ('linkedin_analyzer', 'LinkedIn Analyzer', FALSE, FALSE),
  ('calendar_create',   'Calendar Create',   FALSE, FALSE),
  ('send_email',        'Send Email',        FALSE, FALSE),
  ('slack_post',        'Slack Post',        FALSE, FALSE),
  ('hris_sync',         'HRIS Sync',         FALSE, TRUE),
  ('payroll_update',    'Payroll Update',    FALSE, TRUE)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label, pii_safe = EXCLUDED.pii_safe, is_destructive = EXCLUDED.is_destructive;

-- ── Agent definitions ──────────────────────────────────────────────────────────────
INSERT INTO agent_definitions (name, label, tool_scopes, step_types) VALUES
  ('orchestrator', 'Orchestrator', '["agent:delegate","workflow:*"]', '[]'),
  ('intake',       'Intake',       '["entity:describe","entity:query"]', '["collect","human_input"]'),
  ('policy_bot',   'Policy Bot',   '["entity:describe","vector:search"]', '["condition"]'),
  ('notifier',     'Notifier',     '["send:*","broadcast:*"]', '["notify"]'),
  ('hr_bot',       'HR Bot',       '["employees:*","leave_requests:*"]', '["entity_tool"]'),
  ('finance_bot',  'Finance Bot',  '["expenses:*","budget:read"]', '["entity_tool"]'),
  ('onboarding',   'Onboarding',   '["employees:read","leave_requests:read"]', '["start_agent"]')
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label, tool_scopes = EXCLUDED.tool_scopes, step_types = EXCLUDED.step_types;

-- ── Roles ──────────────────────────────────────────────────────────────────────────
INSERT INTO roles (name, permissions) VALUES
  ('hr_admin', '["notifications:broadcast","employees:create","employees:read","employees:update","employees:terminate","leave_requests:approve"]'),
  ('owner',    '["notifications:broadcast","employees:read","leave_requests:approve"]'),
  ('manager',  '["employees:read","leave_requests:approve"]'),
  ('employee', '["employees:read_self","leave_requests:create"]')
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

-- ════════════════════════════════════════════════════════════════════════════════
-- DEV-TENANT ENTITY DATA (tenant: Acme Corp / …0001)
-- Typed core columns + extended_data JSONB (spec §3.6). Stable UUIDs so foreign-key
-- relationships wire up and re-runs stay idempotent (ON CONFLICT (id) DO NOTHING).
-- Insert order respects FKs: departments → employees (managers before reports) →
-- leave_requests; department heads reference known employee UUIDs (head has no FK).
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Departments ──────────────────────────────────────────────────────────────────
INSERT INTO departments (id, tenant_id, name, head) VALUES
  ('aaaa0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Engineering', 'bbbb0000-0000-0000-0000-000000000001'),
  ('aaaa0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'People Ops',  'bbbb0000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- ── Employees ────────────────────────────────────────────────────────────────────
-- Ada heads Engineering (no manager); Grace & Alan report up the chain; Radia heads
-- People Ops and carries the two Tier 2 extension fields in extended_data.
INSERT INTO employees (id, tenant_id, name, email, role, department_id, manager_id, start_date, employment_type, slack_id, extended_data) VALUES
  ('bbbb0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Ada Lovelace',  'ada@acme.test',   'Engineering Lead',   'aaaa0000-0000-0000-0000-000000000001', NULL,                                   '2021-01-04', 'full_time', 'U0ADA',   '{}'),
  ('bbbb0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Grace Hopper',  'grace@acme.test', 'Senior Engineer',    'aaaa0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', '2022-03-15', 'full_time', 'U0GRC',   '{}'),
  ('bbbb0000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Alan Turing',   'alan@acme.test',  'Engineer',           'aaaa0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002', '2023-09-01', 'full_time', 'U0ALN',   '{}'),
  ('bbbb0000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Radia Perlman', 'radia@acme.test', 'People Ops Manager', 'aaaa0000-0000-0000-0000-000000000002', NULL,                                   '2021-06-21', 'full_time', 'U0RAD',   '{"pronouns":"she/her","linkedin_summary":"Pioneer of network routing protocols."}')
ON CONFLICT (id) DO NOTHING;

-- ── Leave policies ───────────────────────────────────────────────────────────────
INSERT INTO leave_policies (id, tenant_id, name, leave_type, max_days_per_year, requires_approval, notice_days_required) VALUES
  ('cccc0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Annual Leave', 'annual', 25, TRUE,  14),
  ('cccc0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sick Leave',   'sick',   10, FALSE, 0)
ON CONFLICT (id) DO NOTHING;

-- ── Leave requests ───────────────────────────────────────────────────────────────
INSERT INTO leave_requests (id, tenant_id, employee_id, start_date, end_date, type, status, reason) VALUES
  ('dddd0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002', '2026-07-06', '2026-07-10', 'annual', 'submitted', 'Summer holiday'),
  ('dddd0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000003', '2026-06-01', '2026-06-02', 'sick',   'approved',  'Flu')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════
-- SKILLS — global default skills (operator-authored text the compiler turns into a
-- LangGraph) + one tenant-owned skill, so Phase 1c has something to compile/execute.
-- ════════════════════════════════════════════════════════════════════════════════

INSERT INTO default_skills (name, label, skill_text) VALUES
  ('onboard_employee', 'Onboard New Employee',
   'When a new hire is confirmed, create their employee record in @people. Then send them a welcome email with @tool:send_email and post a short introduction to the team channel with @tool:slack_post. Finally, schedule a first-day orientation using @tool:calendar_create.'),
  ('sync_hris', 'Sync Employee to HRIS',
   'After an employee record changes, have @agent:hr_bot push the updated record to the external HRIS with @tool:hris_sync. Because this is a destructive operation, require hr_admin approval before the sync runs.')
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, skill_text = EXCLUDED.skill_text;

INSERT INTO skills (id, tenant_id, name, skill_text, author_role) VALUES
  ('eeee0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Onboard New Employee',
   'When a new hire is confirmed, create their employee record in @people. Then send them a welcome email with @tool:send_email and post a short introduction to the team channel with @tool:slack_post. Finally, schedule a first-day orientation using @tool:calendar_create.',
   'hr_admin')
ON CONFLICT (tenant_id, name) DO NOTHING;
