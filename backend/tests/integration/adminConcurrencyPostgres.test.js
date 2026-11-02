process.env.USE_DB = 'postgres';

const request = require('supertest');
const { pool } = require('../../db/pool');
const { loadSeed } = require('../../db/seeds/loadSeed');
const app = require('../../src/app');
const { userRepo, bookingRepo, motorRepo, documentRepo } = require('../../src/repositories');
const { addDays, format } = require('date-fns');
const bcrypt = require('bcryptjs');

describe('Integration Test: Admin & High Concurrency on Real PostgreSQL', () => {
  let adminToken;
  let admin2Token;
  let staffToken;
  let customerToken;
  let customer2Token;
  let admin1Id;
  let admin2Id;
  let customerUserId;
  let customer2UserId;
  let staffUserId;

  beforeAll(async () => {
    await loadSeed(pool);

    // Login Admin 1
    const a1Res = await request(app).post('/api/auth/login').send({
      email: 'admin@rodakita.id',
      password: 'Admin12345',
    });
    adminToken = a1Res.body.data.token;
    admin1Id = a1Res.body.data.user.id;

    // Buat Admin 2 untuk uji saling menurunkan
    const a2User = await userRepo.create({
      name: 'Admin Kedua PG',
      email: 'admin2.pg@rodakita.id',
      phone: '081299990002',
      role: 'admin',
      passwordHash: bcrypt.hashSync('Admin12345', 10),
    });
    admin2Id = a2User.id;

    const a2Res = await request(app).post('/api/auth/login').send({
      email: 'admin2.pg@rodakita.id',
      password: 'Admin12345',
    });
    admin2Token = a2Res.body.data.token;

    // Login Staff
    const sRes = await request(app).post('/api/auth/login').send({
      email: 'staff@rodakita.id',
      password: 'Staff12345',
    });
    staffToken = sRes.body.data.token;
    staffUserId = sRes.body.data.user.id;

    // Login Customer 1 & 2
    const c1Res = await request(app).post('/api/auth/login').send({
      email: 'demo@rodakita.id',
      password: 'Demo12345',
    });
    customerToken = c1Res.body.data.token;
    customerUserId = c1Res.body.data.user.id;

    const c2Res = await request(app).post('/api/auth/login').send({
      email: 'budi@gmail.com',
      password: 'Budi12345',
    });
    customer2Token = c2Res.body.data.token;
    customer2UserId = c2Res.body.data.user.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('1. 20 Booking Paralel vs 5 Blok Servis Paralel pada Slot Sama', () => {
    test('Tidak pernah ada booking aktif dan blok servis yang beririsan', async () => {
      const today = new Date();
      const start = format(addDays(today, 60), 'yyyy-MM-dd');
      const end = format(addDays(today, 63), 'yyyy-MM-dd');
      const targetMotorId = 8;

      // 20 booking pelanggan paralel
      const bookingPromises = Array.from({ length: 20 }, (_, i) => {
        const token = i % 2 === 0 ? customerToken : customer2Token;
        return request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({
            motorId: targetMotorId,
            startDate: start,
            endDate: end,
            pickupTime: '09:00',
            pickup: 'store',
            payment: 'bank_transfer',
            renter: {
              name: `Concurrent Renter ${i}`,
              phone: '081234567890',
              email: 'demo@rodakita.id',
            },
          });
      });

      // 5 blok servis paralel oleh admin/staff pada slot yang sama
      const servicePromises = Array.from({ length: 5 }, (_, i) => {
        return request(app)
          .post('/api/admin/maintenance')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            motorId: targetMotorId,
            startDate: start,
            endDate: end,
            reason: `Servis Rutin Paralel ${i}`,
          });
      });

      const allResults = await Promise.all([...bookingPromises, ...servicePromises]);

      const successBookings = allResults.slice(0, 20).filter((r) => r.status === 201);
      const successServices = allResults.slice(20).filter((r) => r.status === 201);

      // Total resource yang lolos pada slot yang sama maksimal tepat 1
      const totalSuccess = successBookings.length + successServices.length;
      expect(totalSuccess).toBe(1);

      // Verifikasi di DB: tidak ada booking aktif dan blok servis yang beririsan
      const client = await pool.connect();
      try {
        const overlapRes = await client.query(`
          SELECT mb.id AS maint_id, b.id AS booking_id
          FROM maintenance_blocks mb
          JOIN bookings b ON mb.motorcycle_id = b.motorcycle_id
          WHERE b.motorcycle_id = $1
            AND b.status IN ('pending', 'confirmed', 'active')
            AND daterange(mb.start_date, mb.end_date, '[)') && daterange(b.start_date, b.end_date, '[)')
        `, [targetMotorId]);
        expect(overlapRes.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  describe('2. Dua Serah Terima (Handover) Paralel', () => {
    test('Tepat satu berhasil, lainnya INVALID_STATUS_TRANSITION', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const endStr = format(addDays(new Date(), 3), 'yyyy-MM-dd');

      // Buat booking confirmed untuk unit motor 9
      const bRes = await bookingRepo.create({
        code: `PG-HO-CONCUR-${Date.now()}`,
        userId: customerUserId,
        motorId: 9,
        startDate: todayStr,
        endDate: endStr,
        pickupTime: '09:00',
        pricePerDay: 95000,
        subtotal: 285000,
        rentalTotal: 285000,
        deposit: 200000,
        grandTotal: 485000,
        status: 'confirmed',
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        renter: { name: 'Customer Test', phone: '081234567890', email: 'demo@rodakita.id' },
      });

      // Pastikan dokumen verified
      await documentRepo.updateStatus(customerUserId, 'ktp', 'verified', 'admin');
      await documentRepo.updateStatus(customerUserId, 'sim', 'verified', 'admin');

      // 2 serah terima paralel
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/handover`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            odometerStart: 13000,
            fuelStart: 'penuh',
            originalDocsChecked: true,
            depositReceived: true,
          }),
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/handover`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            odometerStart: 13000,
            fuelStart: 'penuh',
            originalDocsChecked: true,
            depositReceived: true,
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const failRes = res1.status === 400 ? res1 : res2;
      expect(failRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('3. Dua Pengembalian (Return) Paralel', () => {
    test('Tepat satu berhasil, lainnya INVALID_STATUS_TRANSITION', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const endStr = format(addDays(new Date(), 2), 'yyyy-MM-dd');

      // Buat booking active dengan handover sudah ada
      const bRes = await bookingRepo.create({
        code: `PG-RET-CONCUR-${Date.now()}`,
        userId: customerUserId,
        motorId: 10,
        startDate: todayStr,
        endDate: endStr,
        pickupTime: '09:00',
        pricePerDay: 95000,
        subtotal: 190000,
        rentalTotal: 190000,
        deposit: 200000,
        grandTotal: 390000,
        status: 'confirmed',
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        startOdometer: 14000,
        renter: { name: 'Customer Test', phone: '081234567890', email: 'demo@rodakita.id' },
      });

      const { handoverRepo, returnRepo } = require('../../src/repositories');
      await handoverRepo.create({
        bookingId: bRes.id,
        odometerStart: 14000,
        fuelStart: 'penuh',
        notes: 'Handover awal',
        documentsChecked: true,
        depositReceived: true,
        handedOverBy: staffUserId,
      });

      await bookingRepo.update(bRes.id, { status: 'active' });

      // 2 pengembalian paralel
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/return`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            odometerEnd: 14080,
            fuelEnd: 'penuh',
            damageFee: 0,
            otherFee: 0,
          }),
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/return`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            odometerEnd: 14080,
            fuelEnd: 'penuh',
            damageFee: 0,
            otherFee: 0,
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const failRes = res1.status === 400 ? res1 : res2;
      expect(failRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('4. Dua Penandaan Deposit Paralel', () => {
    test('Tepat satu berhasil, lainnya ditolak VALIDATION_ERROR', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // Buat booking completed dengan returnInfo
      const bRes = await bookingRepo.create({
        code: `PG-DEP-CONCUR-${Date.now()}`,
        userId: customerUserId,
        motorId: 11,
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        pickupTime: '09:00',
        pricePerDay: 100000,
        subtotal: 200000,
        rentalTotal: 200000,
        deposit: 200000,
        grandTotal: 400000,
        status: 'confirmed',
        paymentStatus: 'paid',
        paidAt: '2026-10-01T08:00:00Z',
        renter: { name: 'Customer Test', phone: '081234567890', email: 'demo@rodakita.id' },
      });

      const { handoverRepo, returnRepo } = require('../../src/repositories');
      await handoverRepo.create({
        bookingId: bRes.id,
        odometerStart: 15000,
        fuelStart: 'penuh',
        notes: 'Handover awal',
        documentsChecked: true,
        depositReceived: true,
        handedOverBy: staffUserId,
      });

      await bookingRepo.update(bRes.id, { status: 'active' });

      await returnRepo.create({
        bookingId: bRes.id,
        odometerEnd: 15100,
        fuelEnd: 'penuh',
        notes: 'Kembali',
        lateMinutes: 0,
        lateFee: 0,
        damageFee: 0,
        otherFee: 0,
        depositSnapshot: 200000,
        depositRefund: 200000,
        amountDue: 0,
        receivedBy: staffUserId,
      });

      await bookingRepo.update(bRes.id, { status: 'completed' });

      // 2 penandaan deposit paralel
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/deposit-refunded`)
          .set('Authorization', `Bearer ${staffToken}`),
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/deposit-refunded`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const failRes = res1.status === 400 ? res1 : res2;
      expect(failRes.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('5. Pembatalan Admin vs Serah Terima Staf Paralel pada Booking yang Sama', () => {
    test('Keadaan akhir konsisten (antara cancelled atau active) tanpa deadlock', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const endStr = format(addDays(new Date(), 2), 'yyyy-MM-dd');

      const bRes = await bookingRepo.create({
        code: `PG-RACE-CAN-HO-${Date.now()}`,
        userId: customerUserId,
        motorId: 12,
        startDate: todayStr,
        endDate: endStr,
        pickupTime: '09:00',
        pricePerDay: 90000,
        subtotal: 180000,
        rentalTotal: 180000,
        deposit: 200000,
        grandTotal: 380000,
        status: 'confirmed',
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        renter: { name: 'Customer Race', phone: '081234567890', email: 'demo@rodakita.id' },
      });

      // Eksekusi pembatalan dan serah terima serentak
      const [resCancel, resHandover] = await Promise.all([
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/cancel`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ reason: 'Dibatalkan serentak' }),
        request(app)
          .post(`/api/admin/bookings/${bRes.id}/handover`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            odometerStart: 16000,
            fuelStart: 'penuh',
            originalDocsChecked: true,
            depositReceived: true,
          }),
      ]);

      const statuses = [resCancel.status, resHandover.status];
      // Tepat satu yang berhasil (200) dan yang lain ditolak (400)
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      // Cek keadaan akhir di DB
      const finalBooking = await bookingRepo.findById(bRes.id);
      expect(['cancelled', 'active']).toContain(finalBooking.status);
    });
  });

  describe('6. Dua Admin Saling Menurunkan Role Paralel', () => {
    test('Tepat satu berhasil, tetap ada minimal 1 admin aktif di sistem', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/admin/users/${admin2Id}/role`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'staff' }),
        request(app)
          .patch(`/api/admin/users/${admin1Id}/role`)
          .set('Authorization', `Bearer ${admin2Token}`)
          .send({ role: 'staff' }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses.some((s) => s === 400 || s === 403)).toBe(true);

      const failRes = res1.status !== 200 ? res1 : res2;
      expect(['LAST_ADMIN', 'FORBIDDEN_ROLE']).toContain(failRes.body.error.code);

      const remainingAdmins = await userRepo.countActiveAdmins();
      expect(remainingAdmins).toBe(1);

      // Kembalikan role admin1 ke admin untuk pengujian berikutnya
      await userRepo.update(admin1Id, { role: 'admin' });
    });
  });

  describe('7. Ubah Status Motor ke Servis Paralel dengan Pembuatan Booking Pelanggan', () => {
    test('Keadaan akhir konsisten: jika status berubah, booking ditolak; jika booking berhasil, status ditolak', async () => {
      const start = format(addDays(new Date(), 70), 'yyyy-MM-dd');
      const end = format(addDays(new Date(), 73), 'yyyy-MM-dd');
      const motorId = 13;

      const [resStatus, resBooking] = await Promise.all([
        request(app)
          .patch(`/api/admin/motorcycles/${motorId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'maintenance' }),
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            motorId,
            startDate: start,
            endDate: end,
            pickupTime: '09:00',
            pickup: 'store',
            payment: 'bank_transfer',
            renter: { name: 'Customer Race Motor', phone: '081234567890', email: 'demo@rodakita.id' },
          }),
      ]);

      const statuses = [resStatus.status, resBooking.status];
      // Jika motor berhasil diubah ke maintenance (200), booking ditolak 400/409.
      // Jika booking berhasil (201), update motor ditolak 409 (MOTOR_HAS_BOOKINGS).
      if (resBooking.status === 201) {
        expect(resStatus.status).toBe(409);
        expect(resStatus.body.error.code).toBe('MOTOR_HAS_BOOKINGS');
      } else {
        expect(resStatus.status).toBe(200);
        expect([400, 409]).toContain(resBooking.status);
      }
    });
  });
});
