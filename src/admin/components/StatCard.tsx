import React from 'react';
import { type LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  change?: string;
  isPositive?: boolean;
  subtitle?: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  change,
  isPositive = true,
  subtitle,
  color = 'primary',
  onClick,
}) => {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-900 border-primary-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all ${
        onClick ? 'cursor-pointer hover:border-primary-300' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className={`p-2.5 rounded-lg border ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold text-gray-900 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
          {value}
        </div>
        {change && (
          <div className="mt-1 flex items-center">
            <span
              className={`inline-flex items-center text-xs font-semibold ${
                isPositive ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5 flex-shrink-0" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5 flex-shrink-0" />
              )}
              {change}
            </span>
          </div>
        )}
      </div>

      {subtitle && (
        typeof subtitle === 'string' ? (
          <p className="mt-1.5 text-xs text-gray-500">{subtitle}</p>
        ) : (
          <div className="mt-1.5">{subtitle}</div>
        )
      )}
    </div>
  );
};
