export const ROLES = {
  PLATFORM_ADMIN:  'platform_admin',
  HR_ADMIN:        'hr_admin',
  MANAGER:         'manager',
  DEPARTMENT_HEAD: 'department_head',
  EMPLOYEE:        'employee',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.HR_ADMIN]: [
    'employees:create', 'employees:read', 'employees:update', 'employees:terminate',
    'leave_requests:read', 'leave_requests:approve', 'leave_requests:reject',
    'leave_policies:create', 'leave_policies:update',
    'documents:create', 'documents:update',
    'audit_logs:read', 'audit_logs:export',
  ],
  [ROLES.MANAGER]: [
    'employees:read', 'employees:update',
    'leave_requests:read', 'leave_requests:approve',
    'projects:create', 'projects:update',
  ],
  [ROLES.DEPARTMENT_HEAD]: [
    'employees:read', 'employees:update',
    'leave_requests:read', 'leave_requests:approve',
    'projects:create', 'projects:update',
    'documents:read',
  ],
  [ROLES.EMPLOYEE]: [
    'employees:read_self',
    'leave_requests:create', 'leave_requests:cancel_self',
    'leave_policies:read',
    'documents:read',
  ],
};
