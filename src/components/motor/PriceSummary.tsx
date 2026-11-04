import React from 'react';
import { Tag, Sparkles, AlertCircle, Info, Truck, ShieldCheck, PackagePlus } from 'lucide-react';
import { formatRupiah } from '../../lib/format';
import type { BookingQuote } from '../../types';
import { cn } from '../../lib/cn';

interface Props {
  pricePerDay: number;
  days: number;
  deposit: number;
  quote?: BookingQuote | null;
  loading?: boolean;
  className?: string;
}

/**
 * Rincian harga dinamis terpadu:
 * Menampilkan kalkulasi real-time (harga harian, diskon durasi sewa, surcharge akhir pekan/musiman,
 * diskon promo, biaya antar-jemput, deposit jaminan, dan grand total).
 */
export const PriceSummary: React.FC<Props> = ({
  pricePerDay,
  days,
  deposit,
  quote,
  loading = false,
  className,
}) => {
  const safeDays = Math.max(1, days);

  // Jika quote tersedia dari server, gunakan angka riil yang dihitung pricingEngine
  if (quote) {
    const hasDiscount = quote.durationDiscount > 0;
    const hasSurcharges = Array.isArray(quote.surcharges) && quote.surcharges.length > 0;
    const hasPromo = quote.promoDiscount > 0;
    const hasDelivery = quote.deliveryFee > 0;
    const hasAddons = (quote.addOnsTotal ?? 0) > 0;

    return (
      <div className={cn('space-y-3 text-sm transition-opacity duration-200', loading && 'opacity-60', className)}>
        <dl className="space-y-2.5">
          {/* Harga Pokok Sewa */}
          <div className="flex items-center justify-between">
            <dt className="text-neutral-600">
              {formatRupiah(quote.pricePerDay)} × {safeDays} hari
            </dt>
            <dd className="font-medium text-ink">{formatRupiah(quote.subtotal)}</dd>
          </div>

          {/* Surcharges (Weekend, Seasonal, Holiday, Custom) */}
          {hasSurcharges &&
            quote.surcharges.map((sc, idx) => (
              <div key={idx} className="flex items-center justify-between text-amber-700 bg-amber-50/70 px-2.5 py-1 rounded-lg text-xs">
                <dt className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    {sc.name} {sc.matchingDays ? `(${sc.matchingDays} hari)` : ''}
                  </span>
                </dt>
                <dd className="font-semibold">+{formatRupiah(sc.amount)}</dd>
              </div>
            ))}

          {/* Diskon Durasi Sewa */}
          {hasDiscount && (
            <div className="flex items-center justify-between text-emerald-700 bg-emerald-50/70 px-2.5 py-1 rounded-lg text-xs">
              <dt className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Diskon Durasi {quote.durationDiscountPercent}% {safeDays >= 7 ? '(Hemat Spesial)' : ''}
                </span>
              </dt>
              <dd className="font-semibold">-{formatRupiah(quote.durationDiscount)}</dd>
            </div>
          )}

          {/* Biaya Antar-Jemput */}
          {hasDelivery && (
            <div className="flex items-center justify-between text-neutral-600">
              <dt className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                <span>Biaya Antar-Jemput Unit</span>
              </dt>
              <dd className="font-medium text-ink">+{formatRupiah(quote.deliveryFee)}</dd>
            </div>
          )}

          {/* Layanan Tambahan (Add-ons) Terpadu */}
          {hasAddons && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between font-medium text-xs text-blue-900">
                <span className="flex items-center gap-1.5 font-semibold">
                  <PackagePlus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  Layanan Tambahan ({quote.selectedAddOns?.reduce((acc, a) => acc + (a.quantity || 1), 0) || 1} item)
                </span>
                <span className="font-bold text-ink">+{formatRupiah(quote.addOnsTotal || 0)}</span>
              </div>
              {Array.isArray(quote.selectedAddOns) && quote.selectedAddOns.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-blue-100 text-[11px] text-neutral-600">
                  {quote.selectedAddOns.map((item, idx) => {
                    const qty = item.quantity ?? item.qty ?? 1;
                    const pricePerDay = item.price_per_day ?? item.pricePerDay ?? 0;
                    const itemTotal = item.amount ?? item.total ?? item.price ?? pricePerDay * qty * safeDays;
                    return (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="truncate pr-2">
                          {item.name} × {qty} unit
                        </span>
                        <span className="font-medium shrink-0 text-neutral-700">
                          {formatRupiah(itemTotal)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Diskon Kode Promo */}
          {hasPromo && (
            <div className="flex items-center justify-between text-primary-700 bg-primary-50/70 px-2.5 py-1 rounded-lg text-xs">
              <dt className="flex items-center gap-1.5 font-medium">
                <Tag className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                <span>Kode Promo: {quote.promo?.code || 'Kupon Diskon'}</span>
              </dt>
              <dd className="font-semibold">-{formatRupiah(quote.promoDiscount)}</dd>
            </div>
          )}

          {/* Subtotal Biaya Sewa */}
          <div className="flex items-center justify-between border-t border-neutral-200/80 pt-2 text-neutral-700">
            <dt className="font-medium">Total Biaya Sewa</dt>
            <dd className="font-semibold text-ink">{formatRupiah(quote.totalRental)}</dd>
          </div>

          {/* Deposit Jaminan */}
          <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 font-medium text-neutral-700 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Deposit Jaminan
              </dt>
              <dd className="font-semibold text-ink">{formatRupiah(quote.deposit)}</dd>
            </div>
            <p className="text-[11px] text-neutral-500 flex items-center gap-1">
              <Info className="w-3 h-3 text-neutral-400 shrink-0" />
              Dikembalikan 100% penuh saat motor kembali aman & tepat waktu.
            </p>
          </div>

          {/* Grand Total Pembayaran */}
          <div className="flex items-center justify-between border-t-2 border-primary-100 pt-3">
            <div>
              <dt className="font-bold text-ink text-base">Total Tagihan</dt>
              <span className="text-[11px] text-neutral-500">Termasuk biaya sewa & deposit jaminan</span>
            </div>
            <dd className="text-xl font-extrabold text-primary-700">
              {formatRupiah(quote.total || quote.grandTotal)}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  // Fallback standar bila data quote belum dimuat atau komponen dipakai di halaman statis
  const subtotal = pricePerDay * safeDays;
  const grandTotal = subtotal + deposit;

  return (
    <div className={cn('space-y-3 text-sm transition-opacity duration-200', loading && 'opacity-60', className)}>
      <dl className="space-y-2.5">
        <div className="flex justify-between items-center">
          <dt className="text-neutral-600">
            {formatRupiah(pricePerDay)} × {safeDays} hari
          </dt>
          <dd className="font-medium text-ink">{formatRupiah(subtotal)}</dd>
        </div>

        <div className="flex justify-between items-center border-t border-neutral-200/80 pt-2 text-neutral-700">
          <dt className="font-medium">Total Biaya Sewa</dt>
          <dd className="font-semibold text-ink">{formatRupiah(subtotal)}</dd>
        </div>

        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-2.5 space-y-1">
          <div className="flex justify-between items-center">
            <dt className="flex items-center gap-1.5 font-medium text-neutral-700 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Deposit Jaminan
            </dt>
            <dd className="font-semibold text-ink">{formatRupiah(deposit)}</dd>
          </div>
          <p className="text-[11px] text-neutral-500 flex items-center gap-1">
            <Info className="w-3 h-3 text-neutral-400 shrink-0" />
            Dikembalikan 100% penuh saat motor kembali aman & tepat waktu.
          </p>
        </div>

        <div className="flex justify-between items-center border-t-2 border-primary-100 pt-3">
          <div>
            <dt className="font-bold text-ink text-base">Total Tagihan</dt>
            <span className="text-[11px] text-neutral-500">Termasuk biaya sewa & deposit jaminan</span>
          </div>
          <dd className="text-xl font-extrabold text-primary-700">{formatRupiah(grandTotal)}</dd>
        </div>
      </dl>
    </div>
  );
};
export default PriceSummary;
