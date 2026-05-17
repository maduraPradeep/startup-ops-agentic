export const ENTITY_EVENTS = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
} as const;

export const WS_EVENTS = {
  MESSAGE_NEW:      'message:new',
  AGENT_TYPING:     'agent:typing',
  WORKFLOW_UPDATED: 'workflow:updated',
  APPROVAL_NEW:     'approval:new',
  BROADCAST_NEW:    'broadcast:new',
  MESSAGE_SEND:     'message:send',
  APPROVAL_DECISION:'approval:decision',
} as const;

export const TENANT_COLLECTIONS = [
  'employees',
  'leave_policies',
  'leave_requests',
  'projects',
  'documents',
  'approval_chains',
  'audit_logs',
] as const;
