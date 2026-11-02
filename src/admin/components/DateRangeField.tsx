import React from 'react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

interface DateRangeFieldProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  className?: string;
}

export const DateRangeField: React.FC<DateRangeFieldProps> = ({
  startDate,
  endDate,
  onChange,
  className = '',
}) => {
  const handlePreset = (preset: 'today' | '7days' | '30days' | 'thisMonth' | 'all') => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    switch (preset) {
      case 'today':
        onChange(todayStr, todayStr);
        break;
      case '7days':
        onChange(format(subDays(today, 7), 'yyyy-MM-dd'), todayStr);
        break;
      case '30days':
        onChange(format(subDays(today, 30), 'yyyy-MM-dd'), todayStr);
        break;
      case 'thisMonth':
        onChange(
          format(startOfMonth(today), 'yyyy-MM-dd'),
          format(endOfMonth(today), 'yyyy-MM-dd'),
        );
        break;
      case 'all':
        onChange('', '');
        break;
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-300 rounded-lg p-1">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="text-xs bg-transparent border-0 text-gray-700 focus:ring-0 p-1"
        />
        <span className="text-xs text-gray-400">s/d</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="text-xs bg-transparent border-0 text-gray-700 focus:ring-0 p-1"
        />
      </div>

      {/* Presets */}
      <div className="hidden sm:flex items-center gap-1">
        <button
          type="button"
          onClick={() => handlePreset('today')}
          className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          Hari Ini
        </button>
        <button
          type="button"
          onClick={() => handlePreset('7days')}
          className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          7 Hari
        </button>
        <button
          type="button"
          onClick={() => handlePreset('30days')}
          className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          30 Hari
        </button>
        <button
          type="button"
          onClick={() => handlePreset('thisMonth')}
          className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          Bulan Ini
        </button>
      </div>
    </div>
  );
};
