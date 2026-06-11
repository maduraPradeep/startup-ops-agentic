import type {
  AgentDefinition,
  EntityDefinition,
  RoleDefinition,
  ToolRegistryEntry,
} from '@ops/shared';

// Phase 1a — in-memory platform-config fixtures (Postgres stand-in; spec §3, §5.3, §10.1).

export const ENTITY_FIXTURES: EntityDefinition[] = [
  {
    name: 'people',
    label: 'Employees',
    resource: 'employees', // scope/permission key
    tool_ops: ['describe', 'list', 'get', 'create', 'update', 'terminate'],
    fields: [
      { name: 'id', field_type: 'uuid', is_required: true, is_system: true, pii: false, sort_order: 1 },
      { name: 'name', field_type: 'string', is_required: true, is_system: true, pii: true, sort_order: 2 },
      { name: 'email', field_type: 'string', is_required: true, is_system: true, pii: true, sort_order: 3 },
      { name: 'role', field_type: 'string', is_required: true, is_system: true, pii: false, sort_order: 4 },
      { name: 'department_id', field_type: 'uuid', is_required: false, is_system: true, pii: false, sort_order: 5 },
      { name: 'manager_id', field_type: 'uuid', is_required: false, is_system: true, pii: false, sort_order: 6 },
      { name: 'start_date', field_type: 'date', is_required: true, is_system: true, pii: false, sort_order: 7 },
      { name: 'employment_type', field_type: 'string', is_required: false, is_system: true, pii: false, sort_order: 8 },
      { name: 'slack_id', field_type: 'string', is_required: false, is_system: true, pii: false, sort_order: 9 },
      // Tenant extension (Tier 2)
      { name: 'linkedin_summary', field_type: 'string', is_required: false, is_system: false, pii: false, sort_order: 100 },
      { name: 'pronouns', field_type: 'string', is_required: false, is_system: false, pii: false, sort_order: 101 },
    ],
  },
  {
    name: 'leave_requests',
    label: 'Leave Requests',
    resource: 'leave_requests',
    tool_ops: ['describe', 'list', 'get', 'create', 'approve', 'reject', 'cancel'],
    fields: [
      { name: 'id', field_type: 'uuid', is_required: true, is_system: true, pii: false, sort_order: 1 },
      { name: 'employee_id', field_type: 'uuid', is_required: true, is_system: true, pii: false, sort_order: 2 },
      { name: 'start_date', field_type: 'date', is_required: true, is_system: true, pii: false, sort_order: 3 },
      { name: 'end_date', field_type: 'date', is_required: true, is_system: true, pii: false, sort_order: 4 },
      { name: 'type', field_type: 'string', is_required: true, is_system: true, pii: false, sort_order: 5 },
      { name: 'status', field_type: 'string', is_required: false, is_system: true, pii: false, sort_order: 6 },
      { name: 'reason', field_type: 'text', is_required: false, is_system: true, pii: false, sort_order: 7 },
    ],
  },
];

export const TOOL_FIXTURES: ToolRegistryEntry[] = [
  { name: 'linkedin_analyzer', label: 'LinkedIn Analyzer', pii_safe: false, is_destructive: false },
  { name: 'calendar_create', label: 'Calendar Create', pii_safe: false, is_destructive: false },
  { name: 'send_email', label: 'Send Email', pii_safe: false, is_destructive: false },
  { name: 'slack_post', label: 'Slack Post', pii_safe: false, is_destructive: false },
  { name: 'hris_sync', label: 'HRIS Sync', pii_safe: false, is_destructive: true },
  { name: 'payroll_update', label: 'Payroll Update', pii_safe: false, is_destructive: true },
];

export const AGENT_FIXTURES: AgentDefinition[] = [
  { name: 'orchestrator', label: 'Orchestrator', tool_scopes: ['agent:delegate', 'workflow:*'], step_types: [] },
  { name: 'intake', label: 'Intake', tool_scopes: ['entity:describe', 'entity:query'], step_types: ['collect', 'human_input'] },
  { name: 'policy_bot', label: 'Policy Bot', tool_scopes: ['entity:describe', 'vector:search'], step_types: ['condition'] },
  { name: 'notifier', label: 'Notifier', tool_scopes: ['send:*', 'broadcast:*'], step_types: ['notify'] },
  { name: 'hr_bot', label: 'HR Bot', tool_scopes: ['employees:*', 'leave_requests:*'], step_types: ['entity_tool'] },
  { name: 'finance_bot', label: 'Finance Bot', tool_scopes: ['expenses:*', 'budget:read'], step_types: ['entity_tool'] },
  { name: 'onboarding', label: 'Onboarding', tool_scopes: ['employees:read', 'leave_requests:read'], step_types: ['start_agent'] },
];

export const ROLE_FIXTURES: RoleDefinition[] = [
  {
    name: 'hr_admin',
    permissions: [
      'notifications:broadcast',
      'employees:create',
      'employees:read',
      'employees:update',
      'employees:terminate',
      'leave_requests:approve',
    ],
  },
  { name: 'owner', permissions: ['notifications:broadcast', 'employees:read', 'leave_requests:approve'] },
  { name: 'manager', permissions: ['employees:read', 'leave_requests:approve'] },
  { name: 'employee', permissions: ['employees:read_self', 'leave_requests:create'] },
];
