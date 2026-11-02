import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';
import { useAuth } from './AuthContext';

const GUEST_KEY = 'rk_fav_guest_v1';
const userKey = (id: string) => `rk_fav_${id}_v1`;

const readIds = (key: string): string[] => {
  const v = readStorage<unknown>(key, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};

interface FavoritesContextValue {
  ids: string[];
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/** Favorit disimpan lokal (tamu) dan digabung ke akun saat login. */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [prevUserId, setPrevUserId] = useState(userId);
  const [ids, setIds] = useState<string[]>(() =>
    userId
      ? [...new Set([...readIds(userKey(userId)), ...readIds(GUEST_KEY)])]
      : readIds(GUEST_KEY),
  );

  // Saat login: gabungkan favorit tamu dengan favorit akun. Saat logout: kembali ke daftar tamu.
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (userId) {
      const merged = [...new Set([...readIds(userKey(userId)), ...readIds(GUEST_KEY)])];
      writeStorage(userKey(userId), merged);
      removeStorage(GUEST_KEY);
      setIds(merged);
    } else {
      setIds(readIds(GUEST_KEY));
    }
  }

  const persist = useCallback(
    (next: string[]) => {
      writeStorage(userId ? userKey(userId) : GUEST_KEY, next);
      setIds(next);
    },
    [userId],
  );

  const toggle = useCallback(
    (id: string) => {
      const exists = ids.includes(id);
      persist(exists ? ids.filter((x) => x !== id) : [...ids, id]);
      return !exists;
    },
    [ids, persist],
  );
  const remove = useCallback((id: string) => persist(ids.filter((x) => x !== id)), [ids, persist]);
  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);

  const value = useMemo(() => ({ ids, isFavorite, toggle, remove }), [ids, isFavorite, toggle, remove]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites harus dipakai di dalam FavoritesProvider');
  return ctx;
}
