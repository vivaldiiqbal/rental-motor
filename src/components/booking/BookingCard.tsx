import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import type { Booking, Motor } from '../../types';
import { SafeImage } from '../ui/SafeImage';
import { Button } from '../ui/Button';
import { BookingStatusBadge } from './BookingStatusBadge';
import { formatDate, formatRupiah } from '../../lib/format';

/** Item daftar booking milik pengguna. Motor boleh null (data tidak ditemukan) tanpa error. */
export function BookingCard({ booking, motor }: { booking: Booking; motor: Motor | null }) {
  return (
    <article className="card flex flex-col gap-4 p-4 sm:flex-row">
      <SafeImage
        src={motor?.images[0]}
        alt={motor ? `Foto ${motor.name}` : 'Motor'}
        wrapperClassName="aspect-[4/3] w-full shrink-0 rounded-xl sm:w-44"
      />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-ink">{motor?.name ?? 'Motor tidak tersedia'}</h3>
            <p className="text-sm text-neutral-500">Kode: {booking.code}</p>
          </div>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="flex items-center gap-2 text-sm text-neutral-700">
          <CalendarDays aria-hidden className="h-4 w-4 text-primary-600" />
          {formatDate(booking.startDate)} - {formatDate(booking.endDate)} ({booking.days} hari)
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-lg font-bold text-primary-700">{formatRupiah(booking.total)}</p>
          <div className="flex gap-2">
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
