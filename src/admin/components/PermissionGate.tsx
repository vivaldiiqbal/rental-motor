import React from 'react';
import { usePermission } from '../hooks/usePermission';
import type { Permission } from '../permissions';

interface PermissionGateProps {
  permission?: Permission;
  permissions?: Permission[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  permissions,
  fallback = null,
  children,
}) => {
  const { can, canAny } = usePermission();

  let hasAccess = false;

  if (permission) {
    hasAccess = can(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = canAny(permissions);
  } else {
    hasAccess = true;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
