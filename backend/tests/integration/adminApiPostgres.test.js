process.env.USE_DB = 'postgres';

const request = require('supertest');
const { pool } = require('../../db/pool');
const { resetDatabase } = require('../../db/reset');
const app = require('../../src/app');
const {
  userRepo,
  bookingRepo,
  motorRepo,
  documentRepo,
  reviewRepo,
  promoRepo,
  auditRepo,
  returnRepo,
  handoverRepo,
  settingsRepo,
} = require('../../src/repositories');
const { addDays, format } = require('date-fns');

const bcrypt = require('bcryptjs');

describe('Integration Test: Admin API on PostgreSQL Driver', () => {
  let adminToken;
  let customerToken;
  let staffToken;
  let staffUserId;
  let customerUserId;
  let testMotor;

  beforeAll(async () => {
    await resetDatabase(pool);

    // Register / login admin
    const adminLoginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@rodakita.id',
      password: 'Admin12345',
    });
    adminToken = adminLoginRes.body.data.token;

    // Login customer
    const custLoginRes = await request(app).post('/api/auth/login').send({
      email: 'demo@rodakita.id',
      password: 'Demo12345',
    });
    customerToken = custLoginRes.body.data.token;
    customerUserId = custLoginRes.body.data.user.id;

    // Buat akun staff dengan password valid
    const staffHash = bcrypt.hashSync('Staff12345', 10);
    const staffRes = await userRepo.create({
      name: 'Staf Lapangan Postgres',
      email: 'staff.pg@rodakita.id',
      phone: '081299990001',
      role: 'staff',
      passwordHash: staffHash,
      preferences: { emailNotif: true, whatsappNotif: true, promo: false },
    });
    staffUserId = staffRes.id;

    const staffLoginRes = await request(app).post('/api/auth/login').send({
      email: 'staff.pg@rodakita.id',
      password: 'Staff12345',
    });
    staffToken = staffLoginRes.body.data.token;

    // Ambil motor uji
    const motors = await motorRepo.findAll({}, { limit: 1 });
    testMotor = motors.items[0];
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('1. RBAC & Akses Role pada PostgreSQL', () => {
    test('Customer mengakses /api/admin/dashboard/summary ditolak 403', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    test('Staff boleh mengakses /api/admin/dashboard/summary dan bookings', async () => {
      const resDash = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resDash.status).toBe(200);

      const resBookings = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resBookings.status).toBe(200);
    });

    test('Staff mengakses endpoint khusus Admin (Settings) ditolak 403', async () => {
      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('2. Operasional Booking: Payment, Handover, dan Return', () => {
    let bookingId;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(new Date(), 2), 'yyyy-MM-dd');

    test('Membuat booking, verifikasi dokumen, dan konfirmasi bayar manual', async () => {
      // 1. Buat booking baru
      const b = await bookingRepo.create({
        code: `PG-BK-${Date.now()}`,
        userId: customerUserId,
        motorId: testMotor.id,
        startDate: todayStr,
        endDate: tomorrowStr,
        pickupTime: '09:00',
        pricePerDay: testMotor.pricePerDay || 75000,
        subtotal: testMotor.pricePerDay || 75000,
        rentalTotal: testMotor.pricePerDay || 75000,
        deposit: 200000,
        grandTotal: (testMotor.pricePerDay || 75000) + 200000,
        status: 'pending',
        renter: { name: 'Customer Test PG', phone: '081234567890', email: 'customer@rodakita.id' },
      });
      bookingId = b.id;

      // 2. Pastikan dokumen penyewa verified
      await documentRepo.upsert({
        userId: customerUserId,
        type: 'ktp',
        status: 'verified',
        filePath: 'uploads/ktp.jpg',
      });
      await documentRepo.upsert({
        userId: customerUserId,
        type: 'sim',
        status: 'verified',
        filePath: 'uploads/sim.jpg',
      });

      // 3. Konfirmasi bayar manual lewat admin
      const payRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash', amount: (testMotor.pricePerDay || 75000) + 200000, notes: 'Bayar tunai di gerai' });

      expect(payRes.status).toBe(200);
      expect(payRes.body.data.status).toBe('confirmed');
      expect(payRes.body.data.paymentStatus).toBe('paid');
    });

    test('Serah terima unit (Handover) berhasil dan mengubah status ke active', async () => {
      const handoverRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/handover`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          originalDocsChecked: true,
          depositReceived: true,
          odometerStart: 12500,
          fuelStart: 'penuh',
          conditionNotes: 'Mulus terawat',
        });

      expect(handoverRes.status).toBe(200);
      expect(handoverRes.body.data.booking.status).toBe('active');
      expect(handoverRes.body.data.handover.odometerStart).toBe(12500);

      // Cek record handover di DB
      const dbHandover = await handoverRepo.findByBookingId(bookingId);
      expect(dbHandover).toBeDefined();
      expect(dbHandover.odometerStart).toBe(12500);
    });

    test('Trigger DB menolak return jika odometer_end < odometer_start', async () => {
      const returnRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/return`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          odometerEnd: 12400, // < 12500
          fuelEnd: 'penuh',
          damageFee: 0,
          otherFee: 0,
        });

      expect(returnRes.status).toBe(400);
    });

    test('Pengembalian unit (Return) berhasil dan menghitung sisa deposit', async () => {
      const returnRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/return`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          odometerEnd: 12580,
          fuelEnd: 'penuh',
          damageFee: 50000,
          otherFee: 0,
          notes: 'Ada lecet halus di spion',
        });

      expect(returnRes.status).toBe(200);
      expect(returnRes.body.data.booking.status).toBe('completed');
      expect(returnRes.body.data.returnInfo.damageFee).toBe(50000);
      expect(returnRes.body.data.returnInfo.depositRefund).toBe(150000); // 200.000 - 50.000

      // Cek record return di DB
      const dbReturn = await returnRepo.findByBookingId(bookingId);
      expect(dbReturn).toBeDefined();
      expect(dbReturn.odometerEnd).toBe(12580);
      expect(dbReturn.depositRefund).toBe(150000);
    });
  });

  describe('3. Trigger Append-Only pada Tabel audit_logs', () => {
    test('Trigger menolak operasi UPDATE pada audit_logs', async () => {
      const log = await auditRepo.create({
        actorRole: 'admin',
        action: 'TEST_AUDIT',
        entityType: 'Test',
      });

      let updateError = null;
      try {
        await pool.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['HACKED', log.id]);
      } catch (err) {
        updateError = err;
      }

      expect(updateError).toBeDefined();
      expect(updateError.message).toContain('append-only');
    });

    test('Trigger menolak operasi DELETE pada audit_logs', async () => {
      const log = await auditRepo.create({
        actorRole: 'admin',
        action: 'TEST_AUDIT_DELETE',
        entityType: 'Test',
      });

      let deleteError = null;
      try {
        await pool.query('DELETE FROM audit_logs WHERE id = $1', [log.id]);
      } catch (err) {
        deleteError = err;
      }

      expect(deleteError).toBeDefined();
      expect(deleteError.message).toContain('append-only');
    });
  });

  describe('4. Pengaturan Sistem (Settings) di PostgreSQL', () => {
    test('Settings dapat dibaca, diubah, dan direset', async () => {
      const getRes = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.minRentalDays).toBeDefined();

      const putRes = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lateFeeToleranceMinutes: 90,
          lateFeePercentPerHour: 15,
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.lateFeeToleranceMinutes).toBe(90);

      const resetRes = await request(app)
        .post('/api/admin/settings/reset')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.lateFeeToleranceMinutes).toBe(120);
    });
  });

  describe('5. Laporan Agregat SQL & Moderasi Ulasan', () => {
    test('Laporan pendapatan SQL mengembalikan data agregat', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const res = await request(app)
        .get(`/api/admin/reports/revenue?startDate=${todayStr}&endDate=${todayStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totals).toBeDefined();
      expect(res.body.data.totals.totalBookings).toBeGreaterThanOrEqual(1);
    });

    test('Moderasi ulasan: menyembunyikan ulasan dan menghitung ulang rating motor', async () => {
      const review = await reviewRepo.create({
        motorId: testMotor.id,
        userId: customerUserId,
        rating: 1,
        comment: 'Ulasan negatif untuk uji sembunyi',
      });

      const hideRes = await request(app)
        .patch(`/api/admin/reviews/${review.id}/visibility`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isVisible: false,
          hiddenReason: 'Spam atau melanggar ketentuan',
        });

      expect(hideRes.status).toBe(200);
      expect(hideRes.body.data.isVisible).toBe(false);

      const dbReview = await reviewRepo.findById(review.id);
      expect(dbReview.isVisible).toBe(false);
      expect(dbReview.isHidden).toBe(true);
    });
  });
});
