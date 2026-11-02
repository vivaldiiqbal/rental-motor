import { useState, useCallback } from 'react';

export interface UseTableOptions<T> {
  initialPage?: number;
  initialLimit?: number;
  initialSortBy?: keyof T | string;
  initialSortDir?: 'asc' | 'desc';
  initialFilters?: Record<string, any>;
}

export function useTable<T = any>(options: UseTableOptions<T> = {}) {
  const {
    initialPage = 1,
    initialLimit = 10,
    initialSortBy = '',
    initialSortDir = 'desc',
    initialFilters = {},
  } = options;

  const [page, setPage] = useState<number>(initialPage);
  const [limit, setLimit] = useState<number>(initialLimit);
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>(initialSortBy as string);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [filters, setFilters] = useState<Record<string, any>>(initialFilters);

  const setFilter = useCallback((key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset page on filter change
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearch('');
    setPage(1);
  }, [initialFilters]);

  const toggleSort = useCallback((column: string) => {
    setSortBy((prevCol) => {
      if (prevCol === column) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return column;
      }
      setSortDir('asc');
      return column;
    });
  }, []);

  return {
    page,
    setPage,
    limit,
    setLimit,
    search,
    setSearch: (val: string) => {
      setSearch(val);
      setPage(1);
    },
    sortBy,
    sortDir,
    toggleSort,
    filters,
    setFilter,
    resetFilters,
  };
}
