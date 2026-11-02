import React from 'react';
import type { BookingStatus } from '../../types';
import type { DocumentStatus } from '../types';

interface StatusBadgeProps {
  status: BookingStatus | DocumentStatus | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  className = '',
}) => {
  const s = String(status).toLowerCase();

  let colorClasses = 'bg-gray-100 text-gray-800 border-gray-200';
  let label = status;

  switch (s) {
    // Booking Statuses
    case 'pending':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      label = 'Menunggu';
      break;
    case 'confirmed':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Dikonfirmasi';
      break;
    case 'active':
      colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      label = 'Sedang Berjalan';
      break;
    case 'completed':
      colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
      label = 'Selesai';
      break;
    case 'cancelled':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
      label = 'Dibatalkan';
      break;
    case 'expired':
      colorClasses = 'bg-orange-50 text-orange-700 border-orange-200';
      label = 'Kedaluwarsa';
      break;

    // Document Statuses
    case 'verified':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Terverifikasi';
      break;
    case 'rejected':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
      label = 'Ditolak';
      break;

    // Motor Statuses
    case 'available':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Tersedia';
      break;
    case 'rented':
      colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      label = 'Disewa';
      break;
    case 'maintenance':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      label = 'Servis';
      break;

    // Generic / Boolean
    case 'published':
    case 'active_status':
    case 'true':
    case 'aktif':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Aktif';
      break;
    case 'hidden':
    case 'inactive':
    case 'false':
    case 'nonaktif':
      colorClasses = 'bg-gray-100 text-gray-600 border-gray-200';
      label = 'Nonaktif';
      break;

    // Roles
    case 'admin':
      colorClasses = 'bg-purple-50 text-purple-700 border-purple-200 font-semibold';
      label = 'Admin';
      break;
    case 'staff':
      colorClasses = 'bg-sky-50 text-sky-700 border-sky-200 font-semibold';
      label = 'Staff';
      break;
    case 'customer':
      colorClasses = 'bg-gray-50 text-gray-600 border-gray-200';
      label = 'Customer';
      break;

    default:
      label = status;
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs font-medium'
      : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border leading-none ${sizeClasses} ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
};
