const {
  isValidISODate,
  countDays,
  isOverlapping,
  isDateInPast,
  getDaysFromToday,
} = require('../../src/utils/dates');
const clock = require('../../src/utils/clock');

describe('Unit Test: Validasi dan Logika Tanggal (Calendar & Date Math)', () => {
  beforeEach(() => {
    // Kunci jam sistem ke 2026-10-22 09:00 WIB
    clock.setSystemTime('2026-10-22T02:00:00.000Z');
  });

  afterEach(() => {
    clock.resetSystemTime();
  });

  describe('Validasi Format & Kalender Nyata (isValidISODate)', () => {
    test('Menerima tanggal kalender yang valid format YYYY-MM-DD', () => {
      expect(isValidISODate('2026-10-22')).toBe(true);
      expect(isValidISODate('2026-02-28')).toBe(true);
      expect(isValidISODate('2024-02-29')).toBe(true); // Kabisat
    });

    test('Menolak tanggal mustahil di kalender', () => {
      expect(isValidISODate('2026-02-29')).toBe(false); // Bukan kabisat
      expect(isValidISODate('2026-04-31')).toBe(false); // April hanya 30 hari
      expect(isValidISODate('2026-13-01')).toBe(false); // Bulan 13 tidak ada
      expect(isValidISODate('2026-00-10')).toBe(false); // Bulan 0 tidak ada
      expect(isValidISODate('2026-05-32')).toBe(false); // Tanggal 32 tidak ada
    });

    test('Menolak format bukan YYYY-MM-DD', () => {
      expect(isValidISODate('22-10-2026')).toBe(false);
      expect(isValidISODate('2026/10/22')).toBe(false);
      expect(isValidISODate('')).toBe(false);
      expect(isValidISODate(null)).toBe(false);
      expect(isValidISODate(undefined)).toBe(false);
    });
  });

  describe('Validasi Rentang Tanggal Sewa (countDays)', () => {
    test('Menolak atau mengembalikan 0 jika tanggal kembali <= tanggal ambil (durasi 0 atau negatif)', () => {
      expect(countDays('2026-10-25', '2026-10-25')).toBe(0);
      expect(countDays('2026-10-26', '2026-10-25')).toBe(0);
    });

    test('Menghitung hari sewa standar secara akurat', () => {
      expect(countDays('2026-10-22', '2026-10-23')).toBe(1);
      expect(countDays('2026-10-22', '2026-10-25')).toBe(3);
      expect(countDays('2026-10-01', '2026-10-31')).toBe(30);
    });
  });

  describe('Pemeriksaan Masa Lampau & Batas Maksimum Pemesanan', () => {
    test('isDateInPast mendeteksi tanggal sebelum hari ini WIB', () => {
      expect(isDateInPast('2026-10-21')).toBe(true);
      expect(isDateInPast('2026-10-22')).toBe(false); // Hari ini
      expect(isDateInPast('2026-10-23')).toBe(false); // Besok
    });

    test('getDaysFromToday menghitung jarak hari ke depan (misal batas 31 hari & 180 hari)', () => {
      expect(getDaysFromToday('2026-10-22')).toBe(0);
      expect(getDaysFromToday('2026-10-23')).toBe(1);
      expect(getDaysFromToday('2026-11-22')).toBe(31);
      expect(getDaysFromToday('2027-04-20')).toBe(180);
    });
  });

  describe('Semantik Tumpang-Tindih [start, end) (isOverlapping)', () => {
    test('Tanggal kembali BOLEH sama persis dengan tanggal ambil booking berikutnya', () => {
      // Booking A: 22 s/d 25. Booking B: 25 s/d 28
      const overlap = isOverlapping('2026-10-22', '2026-10-25', '2026-10-25', '2026-10-28');
      expect(overlap).toBe(false);
    });

    test('Mendeteksi bentrok jika terdapat irisan waktu', () => {
      expect(isOverlapping('2026-10-22', '2026-10-25', '2026-10-24', '2026-10-27')).toBe(true);
      expect(isOverlapping('2026-10-22', '2026-10-25', '2026-10-23', '2026-10-24')).toBe(true);
    });
  });
});
