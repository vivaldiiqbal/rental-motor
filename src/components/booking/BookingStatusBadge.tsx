import { Badge } from '../ui/Badge';
import type { BookingStatus } from '../../types';

const map: Record<BookingStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'primary' }> = {
  pending: { label: 'Menunggu pembayaran', tone: 'warning' },
  confirmed: { label: 'Terkonfirmasi', tone: 'success' },
  active: { label: 'Sedang berjalan', tone: 'primary' },
  return_requested: { label: 'Menunggu Verifikasi Pengembalian', tone: 'warning' },
  completed: { label: 'Selesai', tone: 'neutral' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
  expired: { label: 'Kedaluwarsa', tone: 'danger' },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const m = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
