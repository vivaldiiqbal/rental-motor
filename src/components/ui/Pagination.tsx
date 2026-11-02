import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Props {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** Daftar halaman dengan elipsis: 1 … 4 5 6 … 12 */
function buildPages(page: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1]);
  const sorted = [...set].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null;
  const btn =
    'flex h-10 min-w-[40px] items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors duration-150';
  return (
    <nav aria-label="Navigasi halaman" className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Halaman sebelumnya"
        className={cn(btn, 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40')}
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </button>
      {buildPages(page, pageCount).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-neutral-500">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={`Halaman ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              btn,
              p === page
                ? 'bg-primary-600 text-white'
                : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100',
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="Halaman berikutnya"
        className={cn(btn, 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40')}
      >
        <ChevronRight aria-hidden className="h-4 w-4" />
      </button>
    </nav>
  );
}
