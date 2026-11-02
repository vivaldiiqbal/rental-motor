const clock = require('../../src/utils/clock');
const { pool } = require('../../db/pool');
const factory = require('../helpers/factory');
const { cleanDatabase } = require('../helpers/dbClean');

describe('Fondasi: Database Tes, Jam Terkendali, & Factory Helpers', () => {
  beforeEach(async () => {
    await cleanDatabase();
    clock.resetSystemTime();
  });

  afterAll(async () => {
    clock.resetSystemTime();
    await pool.end();
  });

  test('Database tes WAJIB berakhiran _test', async () => {
    const res = await pool.query('SELECT current_database() AS db_name');
    expect(res.rows[0].db_name.endsWith('_test')).toBe(true);
  });

  test('Jam terkendali: setSystemTime() dan resetSystemTime() bekerja di NODE_ENV=test', () => {
    const originalTime = new Date('2026-10-22T10:00:00Z');
    clock.setSystemTime(originalTime);
    expect(clock.now().toISOString()).toBe('2026-10-22T10:00:00.000Z');

    clock.resetSystemTime();
    const afterReset = clock.now();
    expect(Math.abs(afterReset.getTime() - Date.now())).toBeLessThan(1000);
  });

  test('Jam terkendali: setSystemTime() melempar error fatal jika NODE_ENV bukan test', () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => {
        clock.setSystemTime(new Date());
      }).toThrow('[SECURITY ERROR]');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  test('Factory & dbClean: membuat entitas lengkap dan membersihkan database secara terisolasi', async () => {
    const user = await factory.createUser();
    const motor = await factory.createMotorcycle();
    const promo = await factory.createPromo({ code: 'DISKON50', discountPercent: 50 });
    const booking = await factory.createBooking({
      userId: user.id,
      motorcycleId: motor.id,
      subtotal: 100000,
      total: 300000,
    });
    const payment = await factory.createPayment(booking.id, { amount: 300000 });

    expect(user.id).toBeDefined();
    expect(motor.id).toBeDefined();
    expect(promo.id).toBeDefined();
    expect(booking.id).toBeDefined();
    expect(payment.id).toBeDefined();

    // Verifikasi pembersihan
    await cleanDatabase();
    const usersCount = await pool.query('SELECT COUNT(*) AS count FROM users');
    const bookingsCount = await pool.query('SELECT COUNT(*) AS count FROM bookings');
    expect(Number(usersCount.rows[0].count)).toBe(0);
    expect(Number(bookingsCount.rows[0].count)).toBe(0);
  });
});
