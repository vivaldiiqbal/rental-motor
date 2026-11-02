import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { isAdminOrStaff } from '../permissions';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface AdminGuardProps {
  children?: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { currentUser, role, isAuthenticated } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated || !currentUser) {
    return <Navigate to={`/admin/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // If logged in as customer, show 403 Forbidden page
  if (!isAdminOrStaff(role)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">403 - Akses Ditolak</h1>
        <p className="mt-2 text-sm text-gray-600 max-w-md">
          Akun Anda ({currentUser.email}) terdaftar dengan peran{' '}
          <span className="font-semibold text-rose-600 uppercase">{role || 'Customer'}</span> yang
          tidak memiliki izin untuk mengakses Panel Admin RodaKita.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            Masuk Akun Admin Lain
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Beranda Publik
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
