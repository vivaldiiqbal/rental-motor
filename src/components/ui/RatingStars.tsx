import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Tampilan bintang (read-only). Nilai tidak valid dianggap 0. */
export function RatingStars({
  value,
  size = 16,
  showValue = false,
  count,
}: {
  value: number;
  size?: number;
  showValue?: boolean;
  count?: number;
}) {
  const safe = Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0;
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Rating ${safe.toFixed(1)} dari 5`}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden
            width={size}
            height={size}
            className={cn(n <= Math.round(safe) ? 'fill-warning-text text-warning-text' : 'text-neutral-300')}
          />
        ))}
      </span>
      {showValue && <span className="text-sm font-semibold text-ink">{safe.toFixed(1)}</span>}
      {count != null && <span className="text-sm text-neutral-500">({count})</span>}
    </span>
  );
}

/** Input bintang interaktif untuk formulir ulasan. */
export function RatingInput({
  value,
  onChange,
  label = 'Beri rating',
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} bintang`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="flex h-11 w-9 items-center justify-center"
        >
          <Star
            aria-hidden
            className={cn('h-7 w-7 transition-colors duration-150', n <= shown ? 'fill-warning-text text-warning-text' : 'text-neutral-300')}
          />
        </button>
      ))}
    </div>
  );
}
