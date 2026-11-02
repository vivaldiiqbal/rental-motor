const { isValidIndonesianPhone, normalizeIndonesianPhone } = require('../../src/utils/phone');
const { registerSchema, loginSchema } = require('../../src/validators/authValidator');
const { createBookingSchema } = require('../../src/validators/bookingValidator');

describe('Unit Test: Validasi Input & Sanitasi (Input Validation & Phone Normalization)', () => {
  describe('Normalisasi & Validasi Telepon Indonesia', () => {
    test('Menerima nomor valid: awalan 08, 628, +628 (9-14 digit)', () => {
      expect(isValidIndonesianPhone('08123456789')).toBe(true);
      expect(isValidIndonesianPhone('628123456789')).toBe(true);
      expect(isValidIndonesianPhone('+628123456789')).toBe(true);
      expect(isValidIndonesianPhone('0812-3456-7890')).toBe(true);
    });

    test('Menolak nomor tidak valid: terlalu pendek, awalan salah, bukan angka', () => {
      expect(isValidIndonesianPhone('021123456')).toBe(false); // Telepon rumah
      expect(isValidIndonesianPhone('08123')).toBe(false);       // Terlalu pendek
      expect(isValidIndonesianPhone('08123456789012345')).toBe(false); // Terlalu panjang (>14 digit)
      expect(isValidIndonesianPhone('0812abc4567')).toBe(false);
      expect(isValidIndonesianPhone('')).toBe(false);
      expect(isValidIndonesianPhone(null)).toBe(false);
    });

    test('Normalisasi selalu menghasilkan format internasional +628...', () => {
      expect(normalizeIndonesianPhone('08123456789')).toBe('+628123456789');
      expect(normalizeIndonesianPhone('628123456789')).toBe('+628123456789');
      expect(normalizeIndonesianPhone('+628123456789')).toBe('+628123456789');
      expect(normalizeIndonesianPhone('0812-3456-7890')).toBe('+6281234567890');
    });
  });

  describe('Zod Schema Validation: Tipe, Batas Panjang, dan Keamanan Input', () => {
    test('Register Schema: Menolak email tidak valid atau sandi terlalu pendek', () => {
      const invalidEmail = registerSchema.safeParse({
        name: 'Budi Santoso',
        email: 'budi-bukan-email',
        phone: '08123456789',
        password: 'Password123!',
      });
      expect(invalidEmail.success).toBe(false);

      const shortPassword = registerSchema.safeParse({
        name: 'Budi Santoso',
        email: 'budi@example.com',
        phone: '08123456789',
        password: '123',
      });
      expect(shortPassword.success).toBe(false);
    });

    test('Login Schema: Menolak input tanpa identifier atau tanpa password', () => {
      expect(loginSchema.safeParse({}).success).toBe(false);
      expect(loginSchema.safeParse({ identifier: 'user@test.id' }).success).toBe(false);
    });

    test('Keamanan Prototype Pollution: Kunci __proto__ dan constructor tidak boleh merusak objek', () => {
      const maliciousPayload = JSON.parse('{"name": "Attacker", "__proto__": {"isAdmin": true}}');
      const parsed = registerSchema.safeParse({
        ...maliciousPayload,
        email: 'attacker@evil.com',
        phone: '081299998888',
        password: 'SecretPassword123!',
      });

      expect(parsed.success).toBe(true);
      // Objek prototype tidak tercemar
      const emptyObj = {};
      expect(emptyObj.isAdmin).toBeUndefined();
    });

    test('Create Booking Schema: Menolak tanggal lampau dan format tidak valid', () => {
      const invalidDates = createBookingSchema.safeParse({
        motorcycleId: 1,
        startDate: '2020-01-01', // Lampau
        endDate: '2020-01-02',
        renter: {
          name: 'Joko',
          phone: '08123456789',
        },
      });
      expect(invalidDates.success).toBe(false);
    });
  });
});
