import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage';

/** State yang tersinkron dengan localStorage; aman jika storage tidak tersedia. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStorage<T>(key, initial));

  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);

  const set = useCallback((next: T | ((prev: T) => T)) => setValue(next), []);
  return [value, set] as const;
}
