import { Bike, Truck, Sparkles } from 'lucide-react';
import type { Motor, PickupMethod, BookingQuote } from '../../types';
import { DateRangePicker } from '../motor/DateRangePicker';
import { PriceSummary } from '../motor/PriceSummary';
import { site } from '../../config/site';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { countDays } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { BookingDraft, DraftErrors } from './draft';

interface Props {
  motor: Motor;
  draft: BookingDraft;
  errors: DraftErrors;
  blocked: Array<{ from: string; to: string }>;
  quote?: BookingQuote | null;
  quoteLoading?: boolean;
  onChange: (patch: Partial<BookingDraft>) => void;
}

const options: Array<{ value: PickupMethod; title: string; desc: string; icon: typeof Bike }> = [
  { value: 'store', title: 'Ambil di toko', desc: 'Gratis. Ambil di lokasi kami.', icon: Bike },
  { value: 'delivery', title: 'Antar ke lokasi', desc: 'Kami antar ke alamat Anda (ongkir dihitung otomatis).', icon: Truck },
];

export function StepRentalDetail({ motor, draft, errors, blocked, quote, quoteLoading = false, onChange }: Props) {
  const { settings } = useSiteSettings();
  const minDays = settings?.rental?.minDays ?? site.rental.minDays;
  const maxDays = settings?.rental?.maxDays ?? site.rental.maxDays;
  const days = draft.startDate && draft.endDate ? countDays(draft.startDate, draft.endDate) : 0;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Tanggal sewa</h2>
        <DateRangePicker
          value={{ startDate: draft.startDate, endDate: draft.endDate }}
          onChange={(v) => onChange(v)}
          blocked={blocked}
        />
        {(errors.startDate || errors.endDate) && (
          <p role="alert" className="mt-2 text-sm text-danger-600">
            {errors.startDate ?? errors.endDate}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <span>Durasi sewa {minDays}-{maxDays} hari.</span>
          {quote?.durationDiscount && quote.durationDiscount > 0 ? (
            <span className="flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Diskon durasi {quote.durationDiscountPercent}% aktif
            </span>
          ) : days >= 1 && days < 3 ? (
            <span className="text-neutral-500">
              💡 Tip: Sewa minimal 3 hari untuk mendapatkan diskon sewa berjenjang.
            </span>
          ) : null}
        </div>
      </section>

      <fieldset>
        <legend className="mb-3 text-lg font-semibold text-ink">Metode pengambilan</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const Icon = o.icon;
            const selected = draft.pickup === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-150',
                  selected ? 'border-primary-600 bg-neutral-50' : 'border-neutral-300 hover:border-neutral-500',
                )}
              >
                <input
                  type="radio"
                  name="pickup"
                  checked={selected}
                  onChange={() => onChange({ pickup: o.value })}
                  className="mt-1 h-4 w-4 accent-primary-600"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <Icon aria-hidden className="h-4 w-4 text-primary-600" />
                    {o.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-neutral-500">{o.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {days > 0 && (
        <section className="rounded-xl bg-neutral-50 p-4 border border-neutral-200/70">
          <PriceSummary
            pricePerDay={motor.pricePerDay}
            days={days}
            deposit={motor.deposit}
            quote={quote}
            loading={quoteLoading}
          />
        </section>
      )}
    </div>
  );
}
