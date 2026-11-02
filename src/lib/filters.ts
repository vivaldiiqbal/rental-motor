import type { MotorQuery, MotorType, SortKey, Transmission } from '../types';
import { PRICE_RANGE } from '../services/api';
import { formatRupiah } from './format';
import { typeLabelMap } from './labels';

export const PAGE_SIZE = 12;
const SORTS: SortKey[] = ['price-asc', 'price-desc', 'rating', 'newest', 'popular'];
const TYPES: MotorType[] = ['matic', 'manual', 'sport', 'trail'];

export const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'popular', label: 'Terpopuler' },
  { value: 'price-asc', label: 'Harga terendah' },
  { value: 'price-desc', label: 'Harga tertinggi' },
  { value: 'rating', label: 'Rating tertinggi' },
  { value: 'newest', label: 'Terbaru' },
];

const num = (v: string | null, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : fallback;
};

/** Membaca filter dari URL secara defensif (nilai aneh diabaikan, tidak pernah error). */
export function parseQuery(sp: URLSearchParams): Required<Omit<MotorQuery, 'pageSize' | 'startDate' | 'endDate'>> &
  Pick<MotorQuery, 'startDate' | 'endDate'> {
  const sort = sp.get('sort') as SortKey | null;
  const trans = sp.get('transmission');
  const min = Math.max(PRICE_RANGE.min, num(sp.get('min'), PRICE_RANGE.min));
  const max = Math.min(PRICE_RANGE.max, num(sp.get('max'), PRICE_RANGE.max));
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;
  return {
    q: sp.get('q') ?? '',
    types: (sp.get('types') ?? '').split(',').filter((t): t is MotorType => TYPES.includes(t as MotorType)),
    brands: (sp.get('brands') ?? '').split(',').filter(Boolean),
    transmission: trans === 'Otomatis' || trans === 'Manual' ? (trans as Transmission) : '',
    minPrice: Math.min(min, max),
    maxPrice: Math.max(min, max),
    minRating: Math.min(5, Math.max(0, num(sp.get('rating'), 0))),
    onlyAvailable: sp.get('available') === '1',
    sort: sort && SORTS.includes(sort) ? sort : 'popular',
    page: Math.max(1, Math.floor(num(sp.get('page'), 1))),
    startDate: start,
    endDate: end,
  };
}

export type ParsedQuery = ReturnType<typeof parseQuery>;

/** Terapkan perubahan ke URLSearchParams. Nilai default dihapus agar URL tetap bersih. */
export function patchParams(sp: URLSearchParams, patch: Partial<ParsedQuery>, resetPage = true): URLSearchParams {
  const next = new URLSearchParams(sp);
  const set = (key: string, value: string | undefined | null) => {
    if (value === undefined || value === null || value === '') next.delete(key);
    else next.set(key, value);
  };
  if ('q' in patch) set('q', patch.q?.trim());
  if ('types' in patch) set('types', patch.types?.join(','));
  if ('brands' in patch) set('brands', patch.brands?.join(','));
  if ('transmission' in patch) set('transmission', patch.transmission);
  if ('minPrice' in patch) set('min', patch.minPrice && patch.minPrice > PRICE_RANGE.min ? String(patch.minPrice) : '');
  if ('maxPrice' in patch) set('max', patch.maxPrice && patch.maxPrice < PRICE_RANGE.max ? String(patch.maxPrice) : '');
  if ('minRating' in patch) set('rating', patch.minRating ? String(patch.minRating) : '');
  if ('onlyAvailable' in patch) set('available', patch.onlyAvailable ? '1' : '');
  if ('sort' in patch) set('sort', patch.sort && patch.sort !== 'popular' ? patch.sort : '');
  if ('startDate' in patch) set('start', patch.startDate);
  if ('endDate' in patch) set('end', patch.endDate);
  if ('page' in patch) set('page', patch.page && patch.page > 1 ? String(patch.page) : '');
  else if (resetPage) next.delete('page');
  return next;
}

export interface Chip {
  key: string;
  label: string;
  /** Patch untuk menghapus chip ini */
  clear: Partial<ParsedQuery>;
}

export function activeChips(q: ParsedQuery): Chip[] {
  const chips: Chip[] = [];
  q.types.forEach((t) =>
    chips.push({ key: `type-${t}`, label: typeLabelMap[t], clear: { types: q.types.filter((x) => x !== t) } }),
  );
  q.brands.forEach((b) =>
    chips.push({ key: `brand-${b}`, label: b, clear: { brands: q.brands.filter((x) => x !== b) } }),
  );
  if (q.transmission) chips.push({ key: 'trans', label: q.transmission, clear: { transmission: '' } });
  if (q.minPrice > PRICE_RANGE.min || q.maxPrice < PRICE_RANGE.max) {
    chips.push({
      key: 'price',
      label: `${formatRupiah(q.minPrice)} - ${formatRupiah(q.maxPrice)}`,
      clear: { minPrice: PRICE_RANGE.min, maxPrice: PRICE_RANGE.max },
    });
  }
  if (q.minRating > 0) chips.push({ key: 'rating', label: `Rating ${q.minRating}+`, clear: { minRating: 0 } });
  if (q.onlyAvailable) chips.push({ key: 'avail', label: 'Tersedia saja', clear: { onlyAvailable: false } });
  return chips;
}
