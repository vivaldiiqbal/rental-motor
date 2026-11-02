import React from 'react';
import { Search, X, RotateCcw } from 'lucide-react';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterSelect {
  key: string;
  label?: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  search?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  hasActiveFilters?: boolean;
  onReset?: () => void;
  children?: React.ReactNode; // Actions slot on the right
}

export const FilterBar: React.FC<FilterBarProps> = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Cari...',
  selects = [],
  hasActiveFilters = false,
  onReset,
  children,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      {/* Left Filter Controls */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1">
        {onSearchChange && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-900 focus:bg-white transition-all text-gray-800 placeholder-gray-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {selects.map((sel) => (
          <div key={sel.key} className="relative min-w-[140px]">
            <select
              value={sel.value}
              onChange={(e) => sel.onChange(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-900 focus:bg-white transition-all cursor-pointer"
            >
              {sel.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {hasActiveFilters && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Reset semua filter"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Right Action slot (e.g., Export CSV, Add New button) */}
      {children && (
        <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-auto">
          {children}
        </div>
      )}
    </div>
  );
};
