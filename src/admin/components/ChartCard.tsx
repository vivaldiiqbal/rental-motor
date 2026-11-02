import React from 'react';
import { ResponsiveContainer } from 'recharts';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  height?: number | string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  actions,
  height = 300,
  loading = false,
  empty = false,
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div style={{ width: '100%', height }} className="relative flex items-center justify-center">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : empty ? (
          <div className="text-center text-xs text-gray-400">Belum ada data grafik</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as any}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
