import { Badge } from '../ui/Badge';
import type { BookingStatus } from '../../types';

const map: Record<BookingStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'primary' }> = {
  pending: { label: 'Menunggu Persetujuan', tone: 'warning' },
  confirmed: { label: 'Dikonfirmasi', tone: 'primary' },
  active: { label: 'Sedang Disewa', tone: 'success' },
  return_requested: { label: 'Pengembalian Diajukan', tone: 'warning' },
  completed: { label: 'Selesai', tone: 'neutral' },
  cancelled: { label: 'Ditolak / Dibatalkan', tone: 'danger' },
  expired: { label: 'Menunggu Persetujuan', tone: 'warning' },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const m = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
