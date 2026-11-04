const {
  format,
  parseISO,
  isValid,
  differenceInCalendarDays,
  addDays,
  getDay,
} = require('date-fns');
const clock = require('./clock');

/**
 * Mendapatkan waktu saat ini di zona waktu Asia/Jakarta (WIB).
 */
function getNowWIB() {
  return clock.now();
}

/**
 * Format tanggal ke ISO YYYY-MM-DD.
 */
function toISODate(date = new Date()) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return format(d, 'yyyy-MM-dd');
}

/**
 * Validasi ketat format YYYY-MM-DD kalender nyata.
 * Menolak tanggal mustahil (misal 30 Februari atau 31 April).
 */
function isValidISODate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return false;
  return format(parsed, 'yyyy-MM-dd') === dateStr;
}

/**
 * Parse string ISO (YYYY-MM-DD atau ISO string) ke Date.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isValid(dateStr) ? dateStr : null;
  if (typeof dateStr !== 'string') return null;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
}

/**
 * Hitung jumlah hari sewa antara dua tanggal (YYYY-MM-DD).
 * Minimal 1 hari jika startDate valid dan endDate valid serta endDate > startDate.
 * Jika endDate <= startDate, kembalikan 0.
 */
function countDays(startDateStr, endDateStr) {
  if (!isValidISODate(startDateStr) || !isValidISODate(endDateStr)) return 0;
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (!start || !end) return 0;
  const diff = differenceInCalendarDays(end, start);
  return diff > 0 ? diff : 0;
}

/**
 * Hitung jumlah hari Sabtu dan Minggu dalam rentang semantik sewa [startDate, endDate).
 */
function countWeekendDays(startDateStr, endDateStr) {
  if (!isValidISODate(startDateStr) || !isValidISODate(endDateStr)) return 0;
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (!start || !end || end <= start) return 0;

  let count = 0;
  let cur = new Date(start);
  while (cur < end) {
    const dayOfWeek = getDay(cur); // 0 = Minggu, 6 = Sabtu
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      count++;
    }
    cur = addDays(cur, 1);
  }
  return count;
}

/**
 * Cek apakah rentang tanggal A dan B bertumpukan dengan semantik [start, end).
 * Formula: aStart < bEnd && bStart < aEnd
 * Tanggal kembali BOLEH sama dengan tanggal ambil booking lain.
 */
function isOverlapping(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Cek apakah sebuah tanggal berada di masa lampau (sebelum hari ini WIB).
 * Menggunakan perbandingan string ISO terhadap todayWIB() agar sepenuhnya
 * imun dari perbedaan zona waktu mesin server (UTC vs WIB).
 */
function isDateInPast(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return true;
  return dateStr < todayWIB();
}

/**
 * Hitung selisih hari dari hari ini ke tanggal tujuan pada zona waktu WIB.
 */
function getDaysFromToday(dateStr) {
  const target = parseDate(dateStr);
  if (!target) return 0;
  const today = parseDate(todayWIB());
  return differenceInCalendarDays(target, today);
}

/**
 * Hitung selisih jam dari waktu saat ini ke datetime tertentu.
 */
function getHoursUntil(dateTimeStr) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return 0;
  // Waktu ambil disimpan sebagai waktu dinding WIB; tanpa penanda zona dianggap +07:00
  // agar hasil tidak bergantung pada zona waktu server.
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(dateTimeStr);
  const target = parseISO(hasZone ? dateTimeStr : `${dateTimeStr}+07:00`);
  if (!isValid(target)) return 0;
  // Jam pecahan (tanpa pemotongan) agar batas 48 jam / 24 jam akurat.
  return (target.getTime() - clock.now().getTime()) / (60 * 60 * 1000);
}

/**
 * Tanggal hari ini (YYYY-MM-DD) pada zona waktu Asia/Jakarta, mengikuti jam terkendali.
 */
function todayWIB() {
  const wib = new Date(clock.now().getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

module.exports = {
  getNowWIB,
  toISODate,
  isValidISODate,
  parseDate,
  countDays,
  countWeekendDays,
  isOverlapping,
  isDateInPast,
  getDaysFromToday,
  getHoursUntil,
  todayWIB,
  addDays,
};
