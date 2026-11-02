import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readStorage, writeStorage } from '../lib/storage';

const KEY = 'rk_compare_v1';
export const MAX_COMPARE = 3;

interface CompareContextValue {
  ids: string[];
  has: (id: string) => boolean;
  /** Mengembalikan false jika sudah penuh */
  toggle: (id: string) => boolean;
  clear: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(() => {
    const v = readStorage<unknown>(KEY, []);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_COMPARE) : [];
  });

  const update = useCallback((next: string[]) => {
    writeStorage(KEY, next);
    setIds(next);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (ids.includes(id)) {
        update(ids.filter((x) => x !== id));
        return true;
      }
      if (ids.length >= MAX_COMPARE) return false;
      update([...ids, id]);
      return true;
    },
    [ids, update],
  );
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const clear = useCallback(() => update([]), [update]);

  const value = useMemo(() => ({ ids, has, toggle, clear }), [ids, has, toggle, clear]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare harus dipakai di dalam CompareProvider');
  return ctx;
}
