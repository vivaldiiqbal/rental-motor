import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { Motor, BookingQuote } from '../../types';
import { DateRangePicker } from './DateRangePicker';
import type { DateValue } from './DateRangePicker';
import { PriceSummary } from './PriceSummary';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { site } from '../../config/site';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { countDays, formatRupiah } from '../../lib/format';
import { dateQuery } from '../../lib/links';
import { getBookingQuote } from '../../services/api';

interface Props {
  motor: Motor;
  dates: DateValue;
  onDatesChange: (v: DateValue) => void;
  blocked: Array<{ from: string; to: string }>;
  /** Ketersediaan untuk tanggal terpilih; null = sedang dicek */
  available: boolean | null;
}

/** Kartu pemesanan di halaman detail (lengket di desktop). */
export function BookingCard({ motor, dates, onDatesChange, blocked, available }: Props) {
  const { settings } = useSiteSettings();
  const maxDays = settings?.rental?.maxDays ?? site.rental.maxDays;
  const freeCancelHours = settings?.rental?.cancellationPolicy?.[0]?.thresholdHours ?? settings?.rental?.freeCancelHours ?? site.rental.freeCancelHours;

  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const hasDates = !!dates.startDate && !!dates.endDate;
  const days = hasDates ? countDays(dates.startDate, dates.endDate) : 0;
  const underMaintenance = motor.status === 'maintenance';
  const tooLong = days > maxDays;
  const canBook = hasDates && available === true && !underMaintenance && !tooLong;

  useEffect(() => {
    if (!hasDates || tooLong || available === false) {
      setQuote(null);
      return;
    }

    let active = true;
    setQuoteLoading(true);

    getBookingQuote({
      motorId: motor.id,
      start: dates.startDate!,
      end: dates.endDate!,
    })
      .then((data) => {
        if (active) setQuote(data);
      })
      .catch(() => {
        if (active) setQuote(null);
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [motor.id, dates.startDate, dates.endDate, hasDates, tooLong, available]);

  return (
    <aside className="card space-y-4 p-5" aria-label="Pemesanan">
      <p className="text-2xl font-bold text-ink">
        {formatRupiah(motor.pricePerDay)}
        <span className="text-sm font-normal text-neutral-500"> / hari</span>
      </p>

      {underMaintenance ? (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-warning p-3 text-sm text-warning-text">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          Motor ini sedang dalam perawatan dan belum dapat disewa.
        </div>
      ) : (
        <>
          <DateRangePicker value={dates} onChange={onDatesChange} blocked={blocked} />

          {hasDates && (
            <div role="status" aria-live="polite">
              {available === null ? (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <Spinner className="h-4 w-4" /> Memeriksa ketersediaan…
                </p>
              ) : available ? (
                <p className="flex items-center gap-2 text-sm font-medium text-success-800">
                  <CheckCircle2 aria-hidden className="h-4 w-4" /> Tersedia di tanggal ini
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-danger-700">
                  <AlertCircle aria-hidden className="h-4 w-4" /> Tidak tersedia di tanggal ini. Coba tanggal lain.
                </p>
              )}
            </div>
          )}

          {hasDates && !tooLong && (
            <PriceSummary
              pricePerDay={motor.pricePerDay}
              days={days}
              deposit={motor.deposit}
              quote={quote}
              loading={quoteLoading}
            />
          )}
          {tooLong && (
            <p role="alert" className="text-sm text-danger-600">
              Maksimal sewa {maxDays} hari (Anda memilih {days} hari).
            </p>
          )}
        </>
      )}

      <Button
        fullWidth
        size="lg"
        disabled={!canBook}
        to={canBook ? `/booking/${motor.slug}${dateQuery(dates.startDate, dates.endDate)}` : undefined}
      >
        {hasDates ? 'Pesan Sekarang' : 'Pilih tanggal dulu'}
      </Button>
      <p className="flex items-center gap-2 text-xs text-neutral-500">
        <ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />
        Batalkan gratis maksimal {freeCancelHours} jam sebelum sewa dimulai.
      </p>
    </aside>
  );
}
