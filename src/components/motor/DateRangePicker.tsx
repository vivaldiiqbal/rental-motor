import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange, Matcher } from 'react-day-picker';
import 'react-day-picker/style.css';
import { addDays, startOfDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { site } from '../../config/site';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { countDays, formatDate, parseDate, toISODate } from '../../lib/format';
import { cn } from '../../lib/cn';

export interface DateValue {
  startDate?: string;
  endDate?: string;
}

interface Props {
  value: DateValue;
  onChange: (value: DateValue) => void;
  /** Rentang yang tidak dapat dipilih (mis. sudah dibooking) */
  blocked?: Array<{ from: string; to: string }>;
  label?: string;
  className?: string;
  /** Tampilkan tombol hapus tanggal */
  clearable?: boolean;
}

const TODAY = startOfDay(new Date());

/** Pemilih rentang tanggal sewa: tanggal ambil dan tanggal kembali. */
export function DateRangePicker({ value, onChange, blocked = [], label = 'Tanggal sewa', className, clearable }: Props) {
  const { settings } = useSiteSettings();
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery('(min-width: 768px)');
  const from = parseDate(value.startDate);
  const to = parseDate(value.endDate);
  const [range, setRange] = useState<DateRange | undefined>(from ? { from, to: to ?? undefined } : undefined);

  const disabled: Matcher[] = [{ before: TODAY }];
  blocked.forEach((b) => {
    const f = parseDate(b.from);
    const t = parseDate(b.to);
    if (f && t) disabled.push({ from: f, to: t });
  });

  const openPicker = () => {
    setRange(from ? { from, to: to ?? undefined } : undefined);
    setOpen(true);
  };

  const apply = () => {
    if (!range?.from) {
      setOpen(false);
      return;
    }
    const start = range.from;
    // Satu hari saja dipilih = sewa 1 hari (kembali keesokan hari)
    const end = range.to && range.to > start ? range.to : addDays(start, 1);
    const days = countDays(toISODate(start), toISODate(end));
    const maxDays = settings?.rental?.maxDays ?? site.rental.maxDays;
    if (days > maxDays) {
      toast.error(`Maksimal sewa ${maxDays} hari (Anda memilih ${days} hari).`);
      return;
    }
    onChange({ startDate: toISODate(start), endDate: toISODate(end) });
    setOpen(false);
  };

  const days = from && to ? countDays(value.startDate, value.endDate) : 0;
  const summary =
    from && to ? `${formatDate(from)} - ${formatDate(to)} · ${days} hari` : 'Pilih tanggal ambil dan kembali';

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        className="flex min-h-[44px] flex-1 items-center gap-3 rounded-xl border border-neutral-300 bg-white px-3 text-left text-sm hover:border-neutral-500"
      >
        <CalendarDays aria-hidden className="h-5 w-5 shrink-0 text-primary-600" />
        <span className="min-w-0">
          <span className="block text-xs text-neutral-500">{label}</span>
          <span className={cn('block truncate font-medium', !(from && to) && 'text-neutral-500')}>{summary}</span>
        </span>
      </button>
      {clearable && from && (
        <Button variant="secondary" onClick={() => onChange({})} aria-label="Hapus tanggal">
          Hapus
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Pilih tanggal sewa"
        className="sm:max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={apply} disabled={!range?.from}>
              Terapkan
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-neutral-500">
          Pilih tanggal ambil, lalu tanggal kembali. Sewa {site.rental.minDays}-{site.rental.maxDays} hari.
        </p>
        <div className="flex justify-center overflow-x-auto">
          <DayPicker
            mode="range"
            locale={idLocale}
            selected={range}
            onSelect={setRange}
            disabled={disabled}
            numberOfMonths={desktop ? 2 : 1}
            defaultMonth={range?.from ?? TODAY}
            startMonth={TODAY}
          />
        </div>
        {range?.from && (
          <p className="mt-3 text-center text-sm font-medium text-primary-700" aria-live="polite">
            {formatDate(range.from)} - {formatDate(range.to && range.to > range.from ? range.to : addDays(range.from, 1))}
          </p>
        )}
      </Modal>
    </div>
  );
}
