const request = require('supertest');
const app = require('../../src/app');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');

describe('Security Test: Matriks Otorisasi Otomatis (Single Source of Truth)', () => {
  let admin, staff, customerA, customerB;
  let adminToken, staffToken, customerAToken, customerBToken;
  let bookingA, motor;

  beforeAll(async () => {
    await cleanDatabase();

    admin = await factory.createAdmin({ email: 'matrix_admin@rodakita.id' });
    staff = await factory.createStaff({ email: 'matrix_staff@rodakita.id' });
    customerA = await factory.createUser({ email: 'matrix_user_a@rodakita.id' });
    customerB = await factory.createUser({ email: 'matrix_user_b@rodakita.id' });

    adminToken = jwt.sign({ id: admin.id, role: 'admin', email: admin.email }, env.JWT_SECRET);
    staffToken = jwt.sign({ id: staff.id, role: 'staff', email: staff.email }, env.JWT_SECRET);
    customerAToken = jwt.sign({ id: customerA.id, role: 'customer', email: customerA.email }, env.JWT_SECRET);
    customerBToken = jwt.sign({ id: customerB.id, role: 'customer', email: customerB.email }, env.JWT_SECRET);

    motor = await factory.createMotorcycle();
    bookingA = await factory.createBooking({
      userId: customerA.id,
      motorcycleId: motor.id,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  /**
   * MATRIKS OTORISASI: Single Source of Truth
   * [method, pathGenerator, allowedRoles]
   */
  const routeMatrix = [
    // Rute Publik (Semua boleh)
    { name: 'Katalog Motor', method: 'get', path: () => '/api/motorcycles', public: true },
    { name: 'Detail Motor', method: 'get', path: () => `/api/motorcycles/${motor.id}`, public: true },
    { name: 'Daftar Promo', method: 'get', path: () => '/api/promos', public: true },
    { name: 'Health Check', method: 'get', path: () => '/api/health', public: true },

    // Rute Customer (Customer, Staff, Admin boleh)
    { name: 'Profil Me', method: 'get', path: () => '/api/auth/me', roles: ['customer', 'staff', 'admin'] },
    { name: 'Daftar Riwayat Booking', method: 'get', path: () => '/api/bookings', roles: ['customer', 'staff', 'admin'] },

    // Rute Operasional Staff & Admin
    { name: 'Admin Summary', method: 'get', path: () => '/api/admin/dashboard/summary', roles: ['staff', 'admin'] },
    { name: 'Admin Bookings List', method: 'get', path: () => '/api/admin/bookings', roles: ['staff', 'admin'] },
    { name: 'Admin Booking Detail', method: 'get', path: () => `/api/admin/bookings/${bookingA.id}`, roles: ['staff', 'admin'] },
    { name: 'Admin Documents List', method: 'get', path: () => '/api/admin/documents', roles: ['staff', 'admin'] },

    // Rute Khusus Admin
    { name: 'Admin Reports Revenue', method: 'get', path: () => '/api/admin/reports/revenue', roles: ['admin'] },
    { name: 'Admin Audit Logs', method: 'get', path: () => '/api/admin/audit-logs', roles: ['admin'] },
    { name: 'Admin Settings', method: 'get', path: () => '/api/admin/settings', roles: ['admin'] },
  ];

  routeMatrix.forEach((r) => {
    describe(`Rute: ${r.name}`, () => {
      if (r.public) {
        test('Anonim (tanpa token) diizinkan mengakses (200 OK)', async () => {
          const res = await request(app)[r.method](r.path());
          expect(res.status).toBe(200);
        });
      } else {
        test('Anonim ditolak dengan 401 UNAUTHORIZED', async () => {
          const res = await request(app)[r.method](r.path());
          expect(res.status).toBe(401);
          expect(res.body.error.code).toBe('UNAUTHORIZED');
        });

        test(`Customer: ${r.roles.includes('customer') ? 'Diizinkan (200)' : 'Ditolak (403 FORBIDDEN_ROLE)'}`, async () => {
          const res = await request(app)[r.method](r.path())
            .set('Authorization', `Bearer ${customerAToken}`);

          if (r.roles.includes('customer')) {
            expect([200, 201]).toContain(res.status);
          } else {
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
          }
        });

        test(`Staff: ${r.roles.includes('staff') ? 'Diizinkan (200)' : 'Ditolak (403 FORBIDDEN_ROLE)'}`, async () => {
          const res = await request(app)[r.method](r.path())
            .set('Authorization', `Bearer ${staffToken}`);

          if (r.roles.includes('staff')) {
            expect([200, 201]).toContain(res.status);
          } else {
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
          }
        });

        test('Admin: Selalu diizinkan', async () => {
          const res = await request(app)[r.method](r.path())
            .set('Authorization', `Bearer ${adminToken}`);

          expect([200, 201]).toContain(res.status);
        });
      }
    });
  });

  describe('Isolasi Antar Pengguna (Cross-Tenant / Other Owner Protection)', () => {
    test('Customer B TIDAK BOLEH mengakses data booking Customer A (harus 404 / 403, tidak boleh bocor)', async () => {
      const res = await request(app)
        .get(`/api/bookings/${bookingA.id}`)
        .set('Authorization', `Bearer ${customerBToken}`);

      // Standar keamanan: harus 404 NOT_FOUND atau 403 FORBIDDEN agar tidak memvalidasi keberadaan id
      expect([403, 404]).toContain(res.status);
    });

    test('Customer B TIDAK BOLEH membatalkan booking milik Customer A', async () => {
      const res = await request(app)
        .post(`/api/bookings/${bookingA.id}/cancel`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ reason: 'Iseng batalkan punya orang' });

      expect([403, 404]).toContain(res.status);
    });
  });
});
