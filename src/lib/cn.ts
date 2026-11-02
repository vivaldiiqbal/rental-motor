/** Gabungkan class secara aman (abaikan nilai falsy). */
export function cn(...parts: unknown[]): string {
  return parts.filter(Boolean).join(' ');
}
