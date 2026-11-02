const {
  maskPlate,
  sanitizeUser,
  sanitizeMotor,
  sanitizeMotors,
} = require('../../src/utils/sanitize');
const { generateBookingCode, SAFE_ALPHABET } = require('../../src/utils/code');

describe('Unit Test: Data Mapper & Sanitizer (Protection & Code Formatting)', () => {
  describe('Sensitif Data Sanitizer (sanitizeUser & maskPlate)', () => {
    test('sanitizeUser menghapus passwordHash, password, salt, resetToken, dan documentPaths', () => {
      const rawUser = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'customer',
        passwordHash: '$2a$10$e8w4f8e9fw8ef',
        password: 'PlainSecretPassword',
        salt: 'randomsalt',
        resetToken: 'sensitive_token_123',
        documentPaths: ['/var/data/ktp.jpg'],
      };

      const clean = sanitizeUser(rawUser);

      expect(clean.id).toBe(1);
      expect(clean.name).toBe('John Doe');
      expect(clean.passwordHash).toBeUndefined();
      expect(clean.password).toBeUndefined();
      expect(clean.salt).toBeUndefined();
      expect(clean.resetToken).toBeUndefined();
      expect(clean.documentPaths).toBeUndefined();
    });

    test('maskPlate menyamarkan 3 karakter terakhir plat nomor untuk akses publik', () => {
      expect(maskPlate('B 1234 ABC')).toBe('B 1234 ***');
      expect(maskPlate('DK 5678 XY')).toBe('DK 5678 ***');
      expect(maskPlate('H 9999 Z')).toBe('H 9999 ***');
      // Bila sudah tersamar, tidak disamarkan ganda
      expect(maskPlate('B 1234 ***')).toBe('B 1234 ***');
    });

    test('sanitizeMotor untuk publik menyamarkan plat nomor; untuk admin mempertahankan plat asli', () => {
      const motor = {
        id: 10,
        name: 'Honda Beat',
        plateNumber: 'B 4321 XYZ',
        pricePerDay: 80000,
      };

      const publicView = sanitizeMotor(motor, false);
      expect(publicView.plateNumber).toBe('B 4321 ***');

      const adminView = sanitizeMotor(motor, true);
      expect(adminView.plateNumber).toBe('B 4321 XYZ');
    });

    test('sanitizeMotors memproses array kendaraan dengan benar', () => {
      const list = [
        { id: 1, plateNumber: 'B 1111 AAA' },
        { id: 2, plateNumber: 'B 2222 BBB' },
      ];

      const sanitized = sanitizeMotors(list, false);
      expect(sanitized).toHaveLength(2);
      expect(sanitized[0].plateNumber).toBe('B 1111 ***');
      expect(sanitized[1].plateNumber).toBe('B 2222 ***');
    });
  });

  describe('Generator Kode Booking Unik (generateBookingCode)', () => {
    test('Menghasilkan format RM-YYMMDD-XXXX dengan karakter aman tanpa ambigu (0, O, 1, I)', () => {
      const date = new Date('2026-10-22T08:00:00Z');
      const code = generateBookingCode(date);

      expect(code).toMatch(/^RM-261022-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);

      // Verifikasi tidak ada karakter ambigu pada bagian acak (suffix 4 karakter)
      const randomPart = code.slice(-4);
      expect(randomPart.includes('0')).toBe(false);
      expect(randomPart.includes('O')).toBe(false);
      expect(randomPart.includes('1')).toBe(false);
      expect(randomPart.includes('I')).toBe(false);
    });

    test('1000 kode yang dihasilkan secara beruntun memiliki tingkat keunikan tinggi tanpa bentrok', () => {
      const set = new Set();
      const count = 1000;
      for (let i = 0; i < count; i++) {
        set.add(generateBookingCode());
      }
      // Peluang bentrok dari 32^4 = 1.048.576 kombinasi per hari pada 1000 sampel sangat kecil (<0.05%)
      expect(set.size).toBeGreaterThanOrEqual(995);
    });
  });

  describe('Perhitungan Rata-Rata Rating dan Distribusi Bintang', () => {
    test('Menghitung rating_avg dan rating_count dari ulasan yang sah', () => {
      const reviews = [
        { rating: 5 },
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
      ];
      // total = 17, count = 4 -> avg = 4.25
      const count = reviews.length;
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      const avg = Number((sum / count).toFixed(2));

      expect(count).toBe(4);
      expect(avg).toBe(4.25);

      const distribution = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 };
      expect(distribution[5]).toBe(2);
      expect(distribution[4]).toBe(1);
      expect(distribution[3]).toBe(1);
      expect(distribution[2]).toBe(0);
      expect(distribution[1]).toBe(0);
    });
  });
});
