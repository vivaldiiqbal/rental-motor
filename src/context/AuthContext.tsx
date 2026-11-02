import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as api from '../services/api';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';
import type { User } from '../types';

const SESSION_KEY = 'rk_session_v1';

interface AuthContextValue {
  user: User | null;
  /** true selama sesi tersimpan sedang dipulihkan */
  initializing: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; phone: string; password: string }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(() => Boolean(readStorage<string | null>(SESSION_KEY, null)));

  // Pulihkan sesi dari storage saat aplikasi dibuka
  useEffect(() => {
    const id = readStorage<string | null>(SESSION_KEY, null);
    if (!id) return;
    api
      .getUser(id)
      .then((u) => setUser(u))
      .catch(() => removeStorage(SESSION_KEY))
      .finally(() => setInitializing(false));
  }, []);

  const startSession = useCallback((u: User) => {
    writeStorage(SESSION_KEY, u.id);
    setUser(u);
    return u;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => startSession(await api.login(email, password)),
    [startSession],
  );
  const register = useCallback(
    async (input: { name: string; email: string; phone: string; password: string }) =>
      startSession(await api.register(input)),
    [startSession],
  );
  const logout = useCallback(() => {
    removeStorage(SESSION_KEY);
    setUser(null);
  }, []);
  const refresh = useCallback(async () => {
    if (!user) return;
    const fresh = await api.getUser(user.id);
    if (fresh) setUser(fresh);
  }, [user]);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout, refresh, setUser }),
    [user, initializing, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
