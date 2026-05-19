import { useAuthStore } from '../stores/auth.store';
import { ROLE_PERMISSIONS, ROLES } from '@ops/shared';

export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role ?? '');

  const can = (permission: string): boolean => {
    if (role === ROLES.PLATFORM_ADMIN) return true;
    return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
  };

  const canAny = (...permissions: string[]): boolean =>
    permissions.some((p) => can(p));

  const isAdmin = role === ROLES.PLATFORM_ADMIN || role === ROLES.HR_ADMIN;

  const canAccessAdmin =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.HR_ADMIN ||
    role === ROLES.MANAGER ||
    role === ROLES.DEPARTMENT_HEAD;

  return { role, can, canAny, isAdmin, canAccessAdmin };
}
