process.env.USE_DB = 'postgres';

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../db/pool');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');

describe('Concurrency Test: Race Conditions on Real PostgreSQL (Double Booking & Invariants)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  test('20 booking paralel pada motor dan tanggal yang sama: tepat 1 sukses (201), 19 ditolak (409 CONFLICT), tidak ada baris ganda', async () => {
    // Jalankan skenario 5 kali beruntun untuk mencari kemungkinan race condition langka
    const REPEAT_COUNT = 5;

    for (let iteration = 1; iteration <= REPEAT_COUNT; iteration++) {
      const motor = await factory.createMotorcycle({ name: `Motor Race ${iteration}` });

      const startDate = `2026-11-${String(10 + iteration).padStart(2, '0')}`;
      const endDate = `2026-11-${String(12 + iteration).padStart(2, '0')}`;

      // Buat 20 pengguna serentak dengan dokumen terverifikasi
      const users = await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          const u = await factory.createUser({ email: `race_${iteration}_${i}@test.id` });
          await factory.verifyUserDocuments(u.id);
          return u;
        })
      );

      const bookingPromises = users.map((u) => {
        const token = jwt.sign({ id: u.id, role: 'customer', email: u.email }, env.JWT_SECRET);
        return request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({
            motorId: motor.id,
            startDate,
            endDate,
            pickupTime: '09:00',
            pickup: 'store',
            payment: 'bank_transfer',
            renter: {
              name: u.name,
              phone: u.phone,
              email: u.email,
            },
          });
      });

      const responses = await Promise.all(bookingPromises);

      const successResponses = responses.filter((r) => r.status === 201);
      const conflictResponses = responses.filter((r) => r.status === 409);

      expect(successResponses.length).toBe(1);
      expect(conflictResponses.length).toBe(19);

      // Verifikasi invarian di PostgreSQL: tepat 1 baris booking tersimpan untuk slot motor ini
      const dbCheck = await pool.query(
        'SELECT COUNT(*) AS count FROM bookings WHERE motorcycle_id = $1 AND start_date = $2 AND end_date = $3',
        [motor.id, startDate, endDate]
      );
      expect(Number(dbCheck.rows[0].count)).toBe(1);
    }
  });

  test('20 booking paralel pada tanggal yang berbeda: semua sukses (201)', async () => {
    const motor = await factory.createMotorcycle({ name: 'Motor Multi Dates' });

    // 20 rentang tanggal tanpa bentrok
    const requests = Array.from({ length: 20 }, async (_, i) => {
      const u = await factory.createUser({ email: `diff_${i}@test.id` });
      await factory.verifyUserDocuments(u.id);
      const token = jwt.sign({ id: u.id, role: 'customer', email: u.email }, env.JWT_SECRET);

      const dayOffset = i * 4; // tiap booking durasi 2 hari, jeda 2 hari
      const d1 = new Date(Date.now() + (dayOffset + 10) * 86400000);
      const d2 = new Date(Date.now() + (dayOffset + 12) * 86400000);
      const startDate = d1.toISOString().slice(0, 10);
      const endDate = d2.toISOString().slice(0, 10);

      return request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          motorId: motor.id,
          startDate,
          endDate,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: {
            name: u.name,
            phone: u.phone,
            email: u.email,
          },
        });
    });

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.status === 201).length;
    expect(successCount).toBe(20);
  });

  test('Tanggal kembali = tanggal ambil booking lain: diizinkan tanpa konflik [start, end)', async () => {
    const motor = await factory.createMotorcycle({ name: 'Motor Touching Slot' });

    const u1 = await factory.createUser({ email: 'touch1@test.id' });
    const u2 = await factory.createUser({ email: 'touch2@test.id' });

    await factory.verifyUserDocuments(u1.id);
    await factory.verifyUserDocuments(u2.id);

    const t1 = jwt.sign({ id: u1.id, role: 'customer', email: u1.email }, env.JWT_SECRET);
    const t2 = jwt.sign({ id: u2.id, role: 'customer', email: u2.email }, env.JWT_SECRET);

    // Booking 1: 2026-12-01 s/d 2026-12-05
    const res1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${t1}`)
      .send({
        motorId: motor.id,
        startDate: '2026-12-01',
        endDate: '2026-12-05',
        pickupTime: '09:00',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: { name: u1.name, phone: u1.phone, email: u1.email },
      });

    // Booking 2: 2026-12-05 s/d 2026-12-10 (start_date sama persis dengan end_date booking 1)
    const res2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${t2}`)
      .send({
        motorId: motor.id,
        startDate: '2026-12-05',
        endDate: '2026-12-10',
        pickupTime: '09:00',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: { name: u2.name, phone: u2.phone, email: u2.email },
      });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});
