import React from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CheckCircle2, Clock, XCircle, ArrowRight, FileText } from 'lucide-react';
import type { BookingTimelineEntry } from '../types';

interface TimelineListProps {
  timeline: BookingTimelineEntry[];
  className?: string;
}

export const TimelineList: React.FC<TimelineListProps> = ({ timeline, className = '' }) => {
  if (!timeline || timeline.length === 0) {
    return <p className="text-xs text-gray-400 italic">Belum ada riwayat aktivitas.</p>;
  }

  // Sort descending by time
  const sorted = [...timeline].sort((a, b) => {
    const timeA = a.at || a.timestamp || '';
    const timeB = b.at || b.timestamp || '';
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'verified':
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'cancelled':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-rose-600" />;
      case 'active':
        return <ArrowRight className="w-4 h-4 text-blue-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={`relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 ${className}`}>
      {sorted.map((item, idx) => {
        const timeStr = item.at || item.timestamp || '';
        let dateFormatted = timeStr;
        if (timeStr) {
          try {
            dateFormatted = format(new Date(timeStr), 'd MMM yyyy, HH:mm', { locale: id }) + ' WIB';
          } catch {
            // ignore
          }
        }

        return (
          <div key={idx} className="relative group">
            {/* Dot */}
            <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center ring-4 ring-white">
              {getStatusIcon(item.status)}
            </div>

            {/* Content */}
            <div className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 capitalize">
                  Status: {item.status}
                </span>
                <span className="text-gray-400 text-[11px]">{dateFormatted}</span>
              </div>

              {item.by && (
                <p className="text-gray-500 text-[11px] mt-0.5">
                  Oleh: <span className="font-medium text-gray-700">{item.by}</span>
                </p>
              )}

              {item.note && (
                <div className="mt-1.5 p-2 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                  {item.note}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
