-- Phase 1b — seed.sql
-- Seeds the Phase 1a fixtures (ENTITY_FIXTURES, TOOL_FIXTURES, AGENT_FIXTURES,
-- ROLE_FIXTURES from packages/compiler/src/registry/fixtures.ts) as the initial
-- platform-config dataset. This is the source PostgresRegistry reads, and it must
-- reproduce MockRegistry's results exactly — including the Tier 2 tenant-extension
-- fields on "people" (is_system = false), which Phase 1a keeps inline in the
-- entity fixture, so they are seeded into platform_fields here for parity.
--
-- Idempotent: safe to re-run.

-- ── Dev tenant ─────────────────────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme')
ON CONFLICT (id) DO NOTHING;

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
