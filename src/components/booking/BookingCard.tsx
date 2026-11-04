import { Link } from 'react-router-dom';
import { CalendarDays, RotateCcw, Banknote, Clock } from 'lucide-react';
import type { Booking, Motor } from '../../types';
import { SafeImage } from '../ui/SafeImage';
import { Button } from '../ui/Button';
import { BookingStatusBadge } from './BookingStatusBadge';
import { RentalCountdownCard } from './RentalCountdownCard';
import { formatDate, formatRupiah } from '../../lib/format';

/** Item daftar booking milik pengguna. Motor boleh null (data tidak ditemukan) tanpa error. */
export function BookingCard({
  booking,
  motor,
  onRequestReturn,
}: {
  booking: Booking;
  motor: Motor | null;
  onRequestReturn?: (booking: Booking, motor: Motor | null) => void;
}) {
  const isCash = booking.payment === 'cash' || booking.paymentMethod === 'cash';
  const isActiveOrReturn = booking.status === 'active' || booking.status === 'return_requested';

  return (
    <article className="card flex flex-col gap-4 p-4 sm:flex-row">
      <SafeImage
        src={motor?.images[0] || booking.motorImage}
        alt={motor ? `Foto ${motor.name}` : 'Motor'}
        wrapperClassName="aspect-[4/3] w-full shrink-0 rounded-xl sm:w-44"
      />
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-ink">
              {motor?.name ?? booking.motorName ?? 'Motor tidak tersedia'}
            </h3>
            <p className="text-sm text-neutral-500">Kode: {booking.code}</p>
          </div>
          <BookingStatusBadge status={booking.status} />
        </div>

        <p className="flex items-center gap-2 text-sm text-neutral-700">
          <CalendarDays aria-hidden className="h-4 w-4 text-primary-600" />
          {formatDate(booking.startDate)} - {formatDate(booking.endDate)} ({booking.days} hari)
        </p>

        {isCash && (booking.status === 'pending' || booking.status === 'confirmed') && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              <strong>Bayar Cash / Tunai:</strong> Waktu sewa dihitung 24 jam penuh per hari dimulai sejak waktu Serah Terima Kunci oleh petugas.
            </span>
          </div>
        )}

        {isActiveOrReturn && (
          <RentalCountdownCard
            handedAt={booking.handedAt || booking.handoverAt}
            dueAt={booking.dueAt}
            days={booking.days}
            pricePerDay={booking.pricePerDay}
            paymentMethod={booking.payment}
          />
        )}

        {booking.status === 'return_requested' && (
          <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-900">
            <Clock className="h-4 w-4 shrink-0 text-purple-700" />
            <span>
              Pengajuan pengembalian ({booking.returnMethod === 'pickup' ? 'Jemput Petugas' : 'Kembalikan ke Toko'}) sedang menunggu verifikasi Admin.
            </span>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-lg font-bold text-primary-700">{formatRupiah(booking.total)}</p>
          <div className="flex flex-wrap gap-2">
            {booking.status === 'active' && onRequestReturn && (
              <button
                type="button"
                onClick={() => onRequestReturn(booking, motor)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                <RotateCcw className="h-4 w-4" />
                Ajukan Pengembalian Motor
              </button>
            )}
            {motor && (
              <Link
                to={`/motors/${motor.slug}`}
                className="inline-flex min-h-[36px] items-center rounded-xl px-3 text-sm font-medium text-primary-700 hover:bg-neutral-100"
              >
                Lihat motor
              </Link>
            )}
            <Button size="sm" to={`/bookings/${booking.code}`}>
              Detail
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
