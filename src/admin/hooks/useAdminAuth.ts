import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../services/adminApi';
import type { AdminUser } from '../types';
import type { AdminRole } from '../permissions';
import toast from 'react-hot-toast';

export function useAdminAuth() {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => adminApi.getCurrentUser());
  const [loading, setLoading] = useState<boolean>(false);

  const refreshUser = useCallback(() => {
    const user = adminApi.getCurrentUser();
    setCurrentUser(user);
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'rk_admin_session_v2') {
        refreshUser();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshUser]);

  const login = async (email: string, pass: string): Promise<AdminUser> => {
    setLoading(true);
    try {
      const user = await adminApi.login(email, pass);
      setCurrentUser(user);
      toast.success(`Selamat datang, ${user.name}!`);
      return user;
    } catch (err: any) {
      toast.error(err.message || 'Login gagal.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await adminApi.logout();
      setCurrentUser(null);
      toast.success('Berhasil keluar.');
    } finally {
      setLoading(false);
    }
  };

  return {
    currentUser,
    role: currentUser?.role as AdminRole | undefined,
    isAuthenticated: Boolean(currentUser),
    isAdmin: currentUser?.role === 'admin',
    isStaff: currentUser?.role === 'staff',
    loading,
    login,
    logout,
    refreshUser,
  };
}
