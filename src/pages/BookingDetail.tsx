import { useState, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  MessageCircle,
  Banknote,
  RotateCcw,
  Clock,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BookingStatusBadge } from '../components/booking/BookingStatusBadge';
import { RentalCountdownCard, formatDateTimeID } from '../components/booking/RentalCountdownCard';
import { RequestReturnModal } from '../components/booking/RequestReturnModal';
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
import { formatDate, formatRupiah } from '../lib/format';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { useRealtime } from '../context/RealtimeContext';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/api\/?$/, '');

function resolvePhotoUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return `${API_BASE_URL}/${url.replace(/^\/+/, '')}`;
}

const paymentLabel = {
  transfer: 'Transfer Bank / VA',
  ewallet: 'QRIS / E-Wallet',
  cash: 'Bayar Cash / Tunai di Toko',
} as const;
const pickupLabel = { store: 'Ambil di toko', delivery: 'Antar ke lokasi' } as const;

export default function BookingDetail() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { registerRefetch } = useRealtime();
  const location = useLocation();
  const justCreated = (location.state as { created?: boolean } | null)?.created === true;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

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
  const isCash = booking.payment === 'cash' || booking.paymentMethod === 'cash';
  const isActiveOrReturn = booking.status === 'active' || booking.status === 'return_requested';
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

      {/* Alert Aturan Pembayaran Cash & Timer 24 Jam */}
      {isCash && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="text-sm leading-relaxed">
            <p className="font-bold">Informasi Pembayaran Tunai (Cash)</p>
            <p className="mt-0.5">
              Waktu sewa dihitung 24 jam penuh per hari dimulai sejak waktu Serah Terima Kunci oleh petugas.
            </p>
          </div>
        </div>
      )}

      {/* Kartu Status Sewa Berjalan & Live Countdown 24 Jam */}
      {isActiveOrReturn && (
        <div className="mt-5 space-y-3">
          <RentalCountdownCard
            handedAt={booking.handedAt || booking.handoverAt}
            dueAt={booking.dueAt}
            days={booking.days}
            pricePerDay={booking.pricePerDay}
            paymentMethod={booking.payment}
          />

          {booking.status === 'active' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Sudah selesai menggunakan motor?</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Ajukan pengembalian motor ke toko atau minta petugas menjemput di lokasi Anda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalOpen(true)}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                <RotateCcw className="h-4 w-4" />
                Ajukan Pengembalian Motor
              </button>
            </div>
          )}

          {booking.status === 'return_requested' && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                <Clock className="h-4 w-4 text-purple-700" />
                Pengajuan Pengembalian Motor Sedang Diverifikasi Admin
              </div>
              <div className="grid gap-2 text-xs text-purple-900 sm:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  {booking.returnMethod === 'pickup' ? (
                    <Truck className="h-4 w-4 text-purple-700" />
                  ) : (
                    <Store className="h-4 w-4 text-purple-700" />
                  )}
                  <span>
                    Metode:{' '}
                    <strong>
                      {booking.returnMethod === 'pickup'
                        ? 'Minta Jemput Petugas (Pickup)'
                        : 'Kembalikan ke Toko'}
                    </strong>
                  </span>
                </div>
                {booking.returnRequestedAt && (
                  <div>
                    Waktu Pengajuan: <strong>{formatDateTimeID(booking.returnRequestedAt)}</strong>
                  </div>
                )}
              </div>
              {booking.returnCustomerNotes && (
                <p className="text-xs text-purple-800 bg-white/80 rounded-lg p-2.5 border border-purple-200">
                  <span className="font-semibold">Catatan Anda:</span> {booking.returnCustomerNotes}
                </p>
              )}
              {booking.returnPhotoUrl && (
                <div className="pt-1">
                  <p className="text-xs font-semibold text-purple-900 mb-1">Foto Kondisi Motor:</p>
                  <img
                    src={resolvePhotoUrl(booking.returnPhotoUrl)}
                    alt="Kondisi motor saat dikembalikan"
                    className="h-36 w-auto rounded-lg border border-purple-200 object-cover"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ringkasan Sewa Selesai */}
      {booking.status === 'completed' && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-2 text-sm text-emerald-950">
          <div className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Sewa Motor Telah Selesai & Diverifikasi Admin
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3 pt-1">
            <div>
              <span className="text-emerald-700 block">Waktu Kembali Aktual</span>
              <strong>{formatDateTimeID(booking.returnedAt)}</strong>
            </div>
            <div>
              <span className="text-emerald-700 block">Denda Keterlambatan</span>
              <strong>{booking.lateFee ? formatRupiah(booking.lateFee) : 'Rp 0 (Tepat Waktu)'}</strong>
            </div>
            <div>
              <span className="text-emerald-700 block">Deposit Jaminan ({formatRupiah(booking.deposit || 200000)})</span>
              <strong>
                {booking.depositReturned !== false ? 'Telah Dikembalikan ke Penyewa' : 'Dipotong Biaya/Denda'}
              </strong>
            </div>
          </div>
        </div>
      )}

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
          <div className="flex flex-wrap gap-2">
            {booking.status === 'active' && (
              <Button onClick={() => setReturnModalOpen(true)}>
                Ajukan Pengembalian Motor
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                Batalkan booking
              </Button>
            )}
          </div>
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

      <RequestReturnModal
        open={returnModalOpen}
        booking={booking}
        motorName={motor?.name}
        onClose={() => setReturnModalOpen(false)}
        onSuccess={() => {
          setReturnModalOpen(false);
          reload();
        }}
      />
    </PageContainer>
  );
}
