import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Inbox, AlertCircle, RefreshCw } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  // Sorting
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  // Pagination
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (newPage: number) => void;
  onLimitChange?: (newLimit: number) => void;
  // Interaction
  onRowClick?: (item: T) => void;
  emptyText?: string;
  emptySubtext?: string;
  keyExtractor?: (item: T, index: number) => string | number;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  error = null,
  onRetry,
  sortBy,
  sortDir = 'asc',
  onSort,
  page = 1,
  totalPages = 1,
  total,
  limit = 10,
  onPageChange,
  onLimitChange,
  onRowClick,
  emptyText = 'Belum ada data',
  emptySubtext = 'Tidak ada catatan yang cocok dengan kriteria filter saat ini.',
  keyExtractor = (item, idx) => item.id || idx,
}: DataTableProps<T>) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between text-rose-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 rounded-lg text-xs font-medium hover:bg-rose-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Coba Lagi
            </button>
          )}
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left text-sm text-gray-700">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              {columns.map((col) => {
                const isSorted = sortBy === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 py-3.5 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''} ${
                      col.className || ''
                    }`}
                    onClick={() => col.sortable && onSort && onSort(col.key)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'right'
                          ? 'justify-end'
                          : col.align === 'center'
                          ? 'justify-center'
                          : 'justify-start'
                      }`}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-gray-400">
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-primary-900" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-primary-900" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              // Loading Skeleton
              Array.from({ length: Math.min(limit, 5) }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`} className="animate-pulse">
                  {columns.map((_, cIdx) => (
                    <td key={`sk-${cIdx}`} className="px-4 py-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              // Empty State
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{emptyText}</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm">{emptySubtext}</p>
                  </div>
                </td>
              </tr>
            ) : (
              // Data Rows
              data.map((item, index) => (
                <tr
                  key={keyExtractor(item, index)}
                  onClick={() => onRowClick && onRowClick(item)}
                  className={`transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-gray-50/80' : 'hover:bg-gray-50/50'
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 text-sm ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {col.render ? col.render(item, index) : item[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {(total !== undefined || totalPages > 1) && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-3">
            {total !== undefined && (
              <span>
                Menampilkan{' '}
                <span className="font-semibold text-gray-900">
                  {data.length === 0 ? 0 : (page - 1) * limit + 1}
                </span>{' '}
                -{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(page * limit, total)}
                </span>{' '}
                dari <span className="font-semibold text-gray-900">{total}</span> data
              </span>
            )}

            {onLimitChange && (
              <div className="flex items-center gap-1.5 ml-2">
                <span>Baris:</span>
                <select
                  value={limit}
                  onChange={(e) => onLimitChange(Number(e.target.value))}
                  className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-900"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            )}
          </div>

          {onPageChange && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Sebelumnya
              </button>

              <span className="px-2 font-medium text-gray-800">
                {page} / {totalPages || 1}
              </span>

              <button
                type="button"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Berikutnya
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
