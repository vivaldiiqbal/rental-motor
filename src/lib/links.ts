/** Susun query string tanggal untuk diteruskan antar halaman. */
export function dateQuery(startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return '';
  return `?start=${startDate}&end=${endDate}`;
}

/** Tujuan login yang aman: hanya path internal. */
export function safeRedirect(target: unknown, fallback = '/'): string {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}
