import { RotateCcw } from 'lucide-react';
import type { MotorType, Transmission } from '../../types';
import { Checkbox } from '../ui/Checkbox';
import { Button } from '../ui/Button';
import { PRICE_RANGE, getBrands } from '../../services/api';
import { typeLabelMap } from '../../lib/labels';
import { formatRupiah } from '../../lib/format';
import type { ParsedQuery } from '../../lib/filters';

interface Props {
  value: ParsedQuery;
  onChange: (patch: Partial<ParsedQuery>) => void;
  onReset: () => void;
  activeCount: number;
}

const TYPES: MotorType[] = ['matic', 'manual', 'sport', 'trail'];
const STEP = 5000;

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function FilterPanel({ value, onChange, onReset, activeCount }: Props) {
  const brands = getBrands();
  const { minPrice, maxPrice } = value;
  const span = PRICE_RANGE.max - PRICE_RANGE.min || 1;
  const left = ((minPrice - PRICE_RANGE.min) / span) * 100;
  const right = 100 - ((maxPrice - PRICE_RANGE.min) / span) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500" aria-live="polite">
          {activeCount > 0 ? `${activeCount} filter aktif` : 'Tidak ada filter aktif'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={activeCount === 0}
          leftIcon={<RotateCcw aria-hidden className="h-4 w-4" />}
        >
          Reset filter
        </Button>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Tipe motor</legend>
        <div className="space-y-1">
          {TYPES.map((t) => (
            <Checkbox
              key={t}
              label={typeLabelMap[t]}
              checked={value.types.includes(t)}
              onChange={() => onChange({ types: toggle(value.types, t) })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Merek</legend>
        <div className="space-y-1">
          {brands.map((b) => (
            <Checkbox
              key={b}
              label={b}
              checked={value.brands.includes(b)}
              onChange={() => onChange({ brands: toggle(value.brands, b) })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Transmisi</legend>
        <div className="space-y-1">
          {(['', 'Otomatis', 'Manual'] as Array<Transmission | ''>).map((t) => (
            <label key={t || 'all'} className="flex min-h-[28px] cursor-pointer items-center gap-2.5 text-sm text-neutral-700">
              <input
                type="radio"
                name="transmission"
                checked={value.transmission === t}
                onChange={() => onChange({ transmission: t })}
                className="h-4 w-4 accent-primary-600"
              />
              {t === '' ? 'Semua' : t}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Harga per hari</legend>
        <p className="mb-3 text-sm text-neutral-700">
          {formatRupiah(minPrice)} - {formatRupiah(maxPrice)}
        </p>
        <div className="dual-range relative h-6">
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-neutral-200" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary-600"
            style={{ left: `${left}%`, right: `${right}%` }}
          />
          <input
            type="range"
            aria-label="Harga minimum"
            min={PRICE_RANGE.min}
            max={PRICE_RANGE.max}
            step={STEP}
            value={minPrice}
            onChange={(e) => onChange({ minPrice: Math.min(Number(e.target.value), maxPrice - STEP) })}
          />
          <input
            type="range"
            aria-label="Harga maksimum"
            min={PRICE_RANGE.min}
            max={PRICE_RANGE.max}
            step={STEP}
            value={maxPrice}
            onChange={(e) => onChange({ maxPrice: Math.max(Number(e.target.value), minPrice + STEP) })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Rating minimal</legend>
        <div className="flex flex-wrap gap-2">
          {[0, 4, 4.5].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={value.minRating === r}
              onClick={() => onChange({ minRating: r })}
              className={`min-h-[40px] rounded-xl border px-3 text-sm font-medium transition-colors duration-150 ${
                value.minRating === r
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {r === 0 ? 'Semua' : `${r}+`}
            </button>
          ))}
        </div>
      </fieldset>

      <Checkbox
        label="Tampilkan yang tersedia saja"
        checked={value.onlyAvailable}
        onChange={(e) => onChange({ onlyAvailable: e.target.checked })}
      />
    </div>
  );
}
