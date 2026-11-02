import { useAdminAuth } from './useAdminAuth';
import { hasPermission, hasAnyPermission, type Permission } from '../permissions';

export function usePermission() {
  const { role, currentUser } = useAdminAuth();

  const can = (permission: Permission): boolean => {
    return hasPermission(role, permission);
  };

  const canAny = (permissions: Permission[]): boolean => {
    return hasAnyPermission(role, permissions);
  };

  return {
    role,
    currentUser,
    can,
    canAny,
    isAdmin: role === 'admin',
    isStaff: role === 'staff',
  };
}
