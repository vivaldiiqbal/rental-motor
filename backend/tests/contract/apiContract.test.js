const request = require('supertest');
const app = require('../../src/app');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');

describe('Contract Test: Respons API vs Kontrak (docs/admin-api-contract.md & Public Schema)', () => {
  let adminUser, staffUser, customerUser;
  let adminToken, staffToken, customerToken;
  let testMotor, testBooking;

  beforeAll(async () => {
    await cleanDatabase();

    adminUser = await factory.createAdmin({ email: 'admin_contract@rodakita.id' });
    staffUser = await factory.createStaff({ email: 'staff_contract@rodakita.id' });
    customerUser = await factory.createUser({ email: 'customer_contract@rodakita.id' });

    adminToken = jwt.sign({ id: adminUser.id, role: 'admin', email: adminUser.email }, env.JWT_SECRET);
    staffToken = jwt.sign({ id: staffUser.id, role: 'staff', email: staffUser.email }, env.JWT_SECRET);
    customerToken = jwt.sign({ id: customerUser.id, role: 'customer', email: customerUser.email }, env.JWT_SECRET);

    testMotor = await factory.createMotorcycle({
      name: 'Vario 160 CC',
      pricePerDay: 120000,
      deposit: 200000,
    });

    testBooking = await factory.createBooking({
      userId: customerUser.id,
      motorcycleId: testMotor.id,
      pricePerDay: 120000,
      deposit: 200000,
      total: 440000,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  describe('Standar Amplop Respons (Standard Envelopes)', () => {
    test('Format Respons Sukses memiliki boolean success: true dan properti data', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(typeof res.body.data).toBe('object');
    });

    test('Format Respons Gagal memiliki boolean success: false dan objek error dengan code & message', async () => {
      const res = await request(app)
        .get('/api/admin/bookings/99999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error.code).toBe('string');
      expect(typeof res.body.error.message).toBe('string');
    });
  });

  describe('Integritas Tipe Data (Data Types: Angka Murni vs String)', () => {
    test('GET /api/motorcycles: Seluruh field numerik (harga, cc, tahun) bertipe Number, bukan String', async () => {
      const res = await request(app).get('/api/motorcycles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const motors = res.body.data;
      expect(Array.isArray(motors)).toBe(true);
      expect(motors.length).toBeGreaterThan(0);

      const m = motors[0];
      expect(typeof m.id).toBe('number');
      expect(typeof m.pricePerDay).toBe('number');
      expect(typeof m.deposit).toBe('number');
      expect(typeof m.year).toBe('number');
      expect(typeof m.cc).toBe('number');
      expect(Number.isNaN(m.pricePerDay)).toBe(false);
    });

    test('GET /api/admin/dashboard/summary: Metrik kartu operasional berupa Number', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(typeof d.todayPickups).toBe('number');
      expect(typeof d.todayReturns).toBe('number');
      expect(typeof d.activeRentals).toBe('number');
      expect(typeof d.monthlyRevenue).toBe('number');
    });
  });

  describe('Kamus Kode Error Kontrak Standar Bisnis', () => {
    test('401 UNAUTHORIZED: Akses rute terproteksi tanpa Bearer Token', async () => {
      const res = await request(app).get('/api/admin/bookings');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('403 FORBIDDEN_ROLE: Pengguna customer mengakses rute admin', async () => {
      const res = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    test('404 RESOURCE_NOT_FOUND: Mengakses ID motor yang tidak ada', async () => {
      const res = await request(app).get('/api/motorcycles/99999999');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(['NOT_FOUND', 'RESOURCE_NOT_FOUND']).toContain(res.body.error.code);
    });

    test('422 / 400 VALIDATION_ERROR: Input tidak memenuhi skema validasi', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'short',
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
