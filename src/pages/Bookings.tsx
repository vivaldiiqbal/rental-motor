import { useState, useEffect } from 'react';
import { CalendarX } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BookingCard } from '../components/booking/BookingCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { getBookings, getMotorsByIds } from '../services/api';
import { cn } from '../lib/cn';
import type { Booking } from '../types';

type Filter = 'all' | 'upcoming' | 'active' | 'history';

const filters: Array<{ id: Filter; label: string; match: (b: Booking) => boolean }> = [
  { id: 'all', label: 'Semua', match: () => true },
  { id: 'upcoming', label: 'Akan datang', match: (b) => b.status === 'pending' || b.status === 'confirmed' },
  { id: 'active', label: 'Berjalan', match: (b) => b.status === 'active' },
  { id: 'history', label: 'Riwayat', match: (b) => b.status === 'completed' || b.status === 'cancelled' },
];

import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { useRealtime } from '../context/RealtimeContext';

export default function Bookings() {
  const { user } = useAuth();
  const { registerRefetch } = useRealtime();
  const [filter, setFilter] = useState<Filter>('all');

  const { data, loading, error, reload } = useAsync(async () => {
    if (!user) return { bookings: [] as Booking[], motors: [] };
    const bookings = await getBookings(user.id);
    const motors = await getMotorsByIds([...new Set(bookings.map((b) => b.motorId))]);
    return { bookings, motors };
  }, [user?.id]);

  // Daftarkan fungsi reload saat reconnect
  useEffect(() => {
    return registerRefetch('bookings-list-page', reload);
  }, [registerRefetch, reload]);

  // Berlangganan event realtime pembaruan booking dan pembayaran
  useRealtimeSubscription('booking.updated', () => {
    reload();
  });
  useRealtimeSubscription('payment.updated', () => {
    reload();
  });

  const current = filters.find((f) => f.id === filter) ?? filters[0];
  const list = (data?.bookings ?? []).filter(current.match);

  return (
    <PageContainer narrow>
      <Seo title="Booking Saya" description="Pantau status dan riwayat pemesanan motor Anda." />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Booking Saya' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Booking saya</h1>

      <div role="group" aria-label="Filter status" className="mt-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors duration-150',
              filter === f.id
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {loading && !data && (
          <div role="status" aria-label="Memuat booking" className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {error && <ErrorState onRetry={reload} />}
        {!error && data && list.length === 0 && (
          <EmptyState
            icon={<CalendarX aria-hidden className="h-6 w-6" />}
            title={filter === 'all' ? 'Belum ada booking' : 'Tidak ada booking di kategori ini'}
            description="Pilih motor dan tentukan tanggal untuk membuat pemesanan pertama Anda."
            action={<Button to="/motors">Pilih motor</Button>}
          />
        )}
        {!error &&
          data &&
          list.map((b) => (
            <BookingCard key={b.id} booking={b} motor={data.motors.find((m) => m.id === b.motorId) ?? null} />
          ))}
      </div>
    </PageContainer>
  );
}
