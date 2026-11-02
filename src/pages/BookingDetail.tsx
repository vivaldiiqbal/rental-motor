import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BookingStatusBadge } from '../components/booking/BookingStatusBadge';
import { PriceSummary } from '../components/motor/PriceSummary';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SafeImage } from '../components/ui/SafeImage';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { ApiError, cancelBooking, getBookingByCode, getMotorsByIds } from '../services/api';
import { site } from '../config/site';
import { formatDate } from '../lib/format';

import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { useRealtime } from '../context/RealtimeContext';
import { useEffect } from 'react';

const paymentLabel = { transfer: 'Transfer bank', ewallet: 'E-wallet', cash: 'Bayar di tempat' } as const;
const pickupLabel = { store: 'Ambil di toko', delivery: 'Antar ke lokasi' } as const;

export default function BookingDetail() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { registerRefetch } = useRealtime();
  const location = useLocation();
  const justCreated = (location.state as { created?: boolean } | null)?.created === true;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const booking = await getBookingByCode(code, user?.id ?? '');
    const [motor] = await getMotorsByIds([booking.motorId]);
    return { booking, motor: motor ?? null };
  }, [code, user?.id]);

  // Daftarkan reload saat reconnect
  useEffect(() => {
    return registerRefetch(`booking-detail-${code}`, reload);
  }, [registerRefetch, reload, code]);

  // Berlangganan event realtime: pembaruan booking atau pembayaran
  useRealtimeSubscription('booking.updated', (ev) => {
    if (!ev.entityId || String(ev.entityId) === String(data?.booking?.id) || ev.entityId === code) {
      reload();
    }
  });

  useRealtimeSubscription('payment.updated', (ev) => {
    if (!ev.entityId || String(ev.entityId) === String(data?.booking?.id) || ev.entityId === code) {
      reload();
    }
  });

  if (loading && !data) {
    return (
      <PageContainer narrow>
        <Skeleton className="h-96 w-full" />
      </PageContainer>
    );
  }
  if (error || !data) {
    const notFound = error instanceof ApiError && error.code === 'NOT_FOUND';
    return (
      <PageContainer narrow>
        {notFound ? (
          <EmptyState title="Booking tidak ditemukan" action={<Button to="/bookings">Booking saya</Button>} />
        ) : (
          <ErrorState onRetry={reload} />
        )}
      </PageContainer>
    );
  }

  const { booking, motor } = data;
  const canCancel = booking.status === 'pending' || booking.status === 'confirmed';
  const waText = encodeURIComponent(`Halo ${site.name}, saya ingin bertanya tentang booking ${booking.code}.`);

  const doCancel = async () => {
    setCancelling(true);
    try {
      await cancelBooking(booking.id);
      toast.success('Booking dibatalkan.');
      setConfirmOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membatalkan booking.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <PageContainer narrow>
      <Seo title={`Booking ${booking.code}`} />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Booking Saya', to: '/bookings' }, { label: booking.code }]} />

      {justCreated && (
        <div role="status" className="mb-5 flex items-start gap-3 rounded-xl bg-success-50 p-4 text-success-800">
          <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Pesanan berhasil dibuat</p>
            <p className="text-sm">Simpan kode booking Anda dan tunjukkan saat pengambilan motor.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Booking {booking.code}</h1>
        <BookingStatusBadge status={booking.status} />
      </div>

      <div className="card mt-6 divide-y divide-neutral-200">
        <section className="flex flex-col gap-4 p-5 sm:flex-row">
          <SafeImage src={motor?.images[0]} alt={motor ? `Foto ${motor.name}` : 'Motor'} wrapperClassName="aspect-[4/3] w-full shrink-0 rounded-xl sm:w-48" />
          <div>
            <h2 className="text-lg font-semibold text-ink">{motor?.name ?? 'Motor tidak tersedia'}</h2>
            {motor && (
              <>
                <p className="text-sm text-neutral-500">
                  {motor.brand} · {motor.cc} cc · {motor.plate}
                </p>
                <Link to={`/motors/${motor.slug}`} className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline">
                  Lihat detail motor
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="p-5">
          <h2 className="mb-3 font-semibold text-ink">Detail sewa</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Tanggal ambil</dt>
              <dd className="font-medium text-ink">{formatDate(booking.startDate)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Tanggal kembali</dt>
              <dd className="font-medium text-ink">{formatDate(booking.endDate)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Pengambilan</dt>
              <dd className="font-medium text-ink">{pickupLabel[booking.pickup]}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Pembayaran</dt>
              <dd className="font-medium text-ink">{paymentLabel[booking.payment]}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Penyewa</dt>
              <dd className="font-medium text-ink">{booking.renter.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Kontak</dt>
              <dd className="font-medium text-ink">{booking.renter.phone}</dd>
            </div>
          </dl>
        </section>

        <section className="p-5">
          <PriceSummary
            pricePerDay={booking.pricePerDay}
            days={booking.days}
            deposit={booking.deposit}
            quote={booking.pricingSnapshot}
          />
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 p-5">
          <Button
            variant="secondary"
            leftIcon={<MessageCircle aria-hidden className="h-4 w-4" />}
            onClick={() => window.open(`https://wa.me/${site.whatsapp}?text=${waText}`, '_blank', 'noopener,noreferrer')}
          >
            Hubungi kami
          </Button>
          {canCancel && (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Batalkan booking
            </Button>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doCancel}
        loading={cancelling}
        danger
        title="Batalkan booking?"
        message={`Booking ${booking.code} akan dibatalkan. Pembatalan gratis berlaku maksimal ${site.rental.freeCancelHours} jam sebelum sewa dimulai.`}
        confirmLabel="Ya, batalkan"
        cancelLabel="Tidak"
      />
    </PageContainer>
  );
}
