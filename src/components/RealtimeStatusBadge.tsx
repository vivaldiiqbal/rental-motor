import React from 'react';
import { useRealtime, type RealtimeStatus } from '../context/RealtimeContext';

interface RealtimeStatusBadgeProps {
  className?: string;
  showText?: boolean;
}

export const RealtimeStatusBadge: React.FC<RealtimeStatusBadgeProps> = ({
  className = '',
  showText = true,
}) => {
  const { status, reconnect } = useRealtime();

  if (status === 'idle') return null;

  const config: Record<RealtimeStatus, { color: string; label: string; dotClass: string }> = {
    connected: {
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      label: 'Tersambung',
      dotClass: 'bg-emerald-500 animate-pulse',
    },
    reconnecting: {
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      label: 'Menyambung ulang...',
      dotClass: 'bg-amber-500 animate-ping',
    },
    offline: {
      color: 'text-rose-700 bg-rose-50 border-rose-200',
      label: 'Offline',
      dotClass: 'bg-rose-500',
    },
    idle: {
      color: 'text-slate-600 bg-slate-50 border-slate-200',
      label: 'Standby',
      dotClass: 'bg-slate-400',
    },
  };

  const current = config[status];

  return (
    <div
      onClick={status !== 'connected' ? reconnect : undefined}
      title={status !== 'connected' ? 'Koneksi terputus. Klik untuk menyambung kembali.' : 'Data tersinkronisasi realtime'}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer select-none transition-all duration-200 ${current.color} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dotClass}`} />
      {showText && <span>{current.label}</span>}
    </div>
  );
};
