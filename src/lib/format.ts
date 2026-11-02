import { format, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** Rp 150.000 - aman untuk nilai tidak valid. */
export function formatRupiah(value: unknown): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return rupiah.format(n).replace(/\u00a0/g, ' ');
}

/** Parse string ISO (yyyy-MM-dd) menjadi Date lokal; null jika tidak valid. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** 21 Okt 2026 */
export function formatDate(value?: string | Date | null): string {
  const d = value instanceof Date ? value : parseDate(value);
  if (!d || !isValid(d)) return '-';
  return format(d, 'd MMM yyyy', { locale: idLocale });
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Jumlah hari sewa (inklusif mulai, eksklusif kembali). Mengembalikan 0 jika tanggal tidak valid atau kembali <= ambil. */
export function countDays(start?: string | null, end?: string | null): number {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return 0;
  const diff = differenceInCalendarDays(e, s);
  return diff < 0 ? 0 : diff;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}
