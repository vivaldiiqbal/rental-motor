import React from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { NoAccess } from '../components/NoAccess';

interface AdminOnlyGuardProps {
  children: React.ReactNode;
}

export const AdminOnlyGuard: React.FC<AdminOnlyGuardProps> = ({ children }) => {
  const { role } = useAdminAuth();

  if (role !== 'admin') {
    return <NoAccess />;
  }

  return <>{children}</>;
};

export default AdminOnlyGuard;
