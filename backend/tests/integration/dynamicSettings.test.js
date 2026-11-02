process.env.USE_DB = 'memory';

const request = require('supertest');
const app = require('../../src/app');
const {
  store,
  userRepo,
  bookingRepo,
  motorRepo,
  auditRepo,
  settingsRepo,
} = require('../../src/repositories');
const settingsService = require('../../src/services/admin/settingsService');
const { calculateCancellationRefund } = require('../../src/config/rules');
const returnService = require('../../src/services/admin/returnService');

describe('Integration Test: Dynamic Settings, Policy Snapshot & Public Meta API', () => {
  let adminToken;
  let customerToken;
  let customerUser;
  let staffToken;

  const validRenter = {
    name: 'Budi Penyewa',
    phone: '081234567890',
    email: 'budi@example.com',
    idNumber: '3201234567890001',
  };

  beforeEach(async () => {
    store.resetToSeed();
    settingsService.invalidateCache();

    // 1. Login Admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminLogin.body.data.token;

    // 2. Login Customer
    const demoLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerToken = demoLogin.body.data.token;
    customerUser = demoLogin.body.data.user;

    // 3. Login Staff
    const user2 = await userRepo.findByEmail('budi@gmail.com');
    await userRepo.update(user2.id, { role: 'staff' });
    const staffLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'budi@gmail.com', password: 'Budi12345' });
    staffToken = staffLogin.body.data.token;
  });

  describe('1. Public Meta Endpoints (Safe & Dynamic)', () => {
    test('GET /api/meta/site mengembalikan konfigurasi publik aman tanpa kredensial', async () => {
      const res = await request(app).get('/api/meta/site');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.brandName).toBeDefined();
      expect(data.whatsappNumber).toBeDefined();
      expect(data.address).toBeDefined();
      expect(data.contactEmail).toBeDefined();
      expect(data.operatingHours).toBeDefined();
      expect(data.minRentalDays).toBeDefined();
      expect(data.maxRentalDays).toBeDefined();
      expect(data.minRenterAge).toBeDefined();
      expect(data.cancellationPolicy).toBeDefined();

      // Pastikan tidak ada data rahasia
      expect(data.databaseUrl).toBeUndefined();
      expect(data.jwtSecret).toBeUndefined();
      expect(data.webhookSecret).toBeUndefined();
      expect(data.apiKey).toBeUndefined();
    });

    test('GET /api/meta/rental-options mengembalikan aturan sewa dinamis yang sinkron dengan settings', async () => {
      // Ubah settings via admin
      await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          minRentalDays: 2,
          maxRentalDays: 14,
          lateFeeToleranceMinutes: 45,
          lateFeePercentPerHour: 15,
        });

      const res = await request(app).get('/api/meta/rental-options');
      expect(res.status).toBe(200);
      expect(res.body.data.rules.minDays).toBe(2);
      expect(res.body.data.rules.maxDays).toBe(14);
      expect(res.body.data.rules.lateFeeToleranceMinutes).toBe(45);
      expect(res.body.data.rules.lateFeePercentPerHour).toBe(15);
    });
  });

  describe('2. Admin Settings & RBAC & Validasi', () => {
    test('Akses non-admin (customer atau staff) ditolak dengan 403', async () => {
      const custRes = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custRes.status).toBe(403);

      const staffRes = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ brandName: 'Hacked Brand' });
      expect(staffRes.status).toBe(403);

      const noAuthRes = await request(app)
        .get('/api/admin/settings');
      expect(noAuthRes.status).toBe(401);
    });

    test('Validasi rentang nilai ditolak dengan 400 Validation Error', async () => {
      // 1. minRentalDays > maxRentalDays
      const res1 = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ minRentalDays: 10, maxRentalDays: 5 });
      expect(res1.status).toBe(400);

      // 2. lateFeePercentPerHour di luar 1..100
      const res2 = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lateFeePercentPerHour: 150 });
      expect(res2.status).toBe(400);

      // 3. Nomor WhatsApp format tidak valid
      const res3 = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ whatsappNumber: 'invalid-phone-abc' });
      expect(res3.status).toBe(400);

      // 4. Email format tidak valid
      const res4 = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactEmail: 'bukan-email' });
      expect(res4.status).toBe(400);

      // 5. minRenterAge di luar 17..100
      const res5 = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ minRenterAge: 12 });
      expect(res5.status).toBe(400);

      // 6. Urutan ambang refund tidak masuk akal (ambang jam lebih kecil memberikan refund lebih besar)
      const res6 = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cancellationPolicy: [
            { thresholdHours: 48, refundPercent: 50 },
            { thresholdHours: 24, refundPercent: 100 }, // Salah: batal 24 jam malah dapat 100% sementara 48 jam hanya 50%
          ],
        });
      expect(res6.status).toBe(400);
      expect(res6.body.error?.message || res6.body.message).toMatch(/Urutan kebijakan pembatalan tidak masuk akal/i);
    });

    test('Update settings berhasil, cache ter-invalidasi, dan audit log tercatat', async () => {
      const updateRes = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          brandName: 'RodaKita Super Dynamic',
          whatsappNumber: '089912345678',
          contactEmail: 'halo@superdynamic.com',
          minRentalDays: 2,
          maxRentalDays: 20,
          bookingExpireMinutes: 45,
          lateFeeToleranceMinutes: 90,
          lateFeePercentPerHour: 12,
          defaultDeposit: 250000,
          cancellationPolicy: [
            { thresholdHours: 72, refundPercent: 100 },
            { thresholdHours: 24, refundPercent: 50 },
            { thresholdHours: 0, refundPercent: 0 },
          ],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.brandName).toBe('RodaKita Super Dynamic');
      expect(updateRes.body.data.bookingExpireMinutes).toBe(45);
      expect(updateRes.body.data.paymentExpiryMinutes).toBe(45);

      // Verifikasi pembacaan berikutnya langsung mencerminkan data baru (cache ter-invalidasi)
      const siteMeta = await request(app).get('/api/meta/site');
      expect(siteMeta.body.data.brandName).toBe('RodaKita Super Dynamic');
      expect(siteMeta.body.data.contactEmail).toBe('halo@superdynamic.com');

      // Verifikasi audit log
      const logs = await auditRepo.findAll({ action: 'UPDATE_SETTINGS' }, { limit: 5 });
      expect(logs.items.length).toBeGreaterThan(0);
      expect(logs.items[0].entityType).toBe('Settings');
    });

    test('Reset settings mengembalikan konfigurasi default dan tercatat di audit log', async () => {
      // Ubah terlebih dahulu
      await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ brandName: 'Temp Brand' });

      // Reset
      const resetRes = await request(app)
        .post('/api/admin/settings/reset')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.brandName).toBe('RodaKita Rental Motor');

      // Verifikasi audit log reset
      const logs = await auditRepo.findAll({ action: 'RESET_SETTINGS' }, { limit: 5 });
      expect(logs.items.length).toBeGreaterThan(0);
    });
  });

  describe('3. Snapshot Policy Isolation pada Booking', () => {
    test('Booking baru menyimpan policy_snapshot; booking lama tidak terpengaruh oleh perubahan settings berikutnya', async () => {
      // 1. Atur settings awal
      await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          minRentalDays: 1,
          maxRentalDays: 30,
          lateFeeToleranceMinutes: 60,
          lateFeePercentPerHour: 10,
          cancellationThresholdHours: 24,
          cancellationRefundPercent: 50,
        });

      // 2. Buat Booking 1 (dengan policy awal)
      const motorsRes = await motorRepo.findAll();
      const motor = (motorsRes.items && motorsRes.items[0]) || motorsRes[0];

      const createRes1 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: motor.id,
          startDate: '2026-11-05',
          endDate: '2026-11-07',
          renter: validRenter,
          pickup: 'store',
        });

      expect(createRes1.status).toBe(201);
      const booking1 = createRes1.body.data;
      expect(booking1.policySnapshot).toBeDefined();
      expect(booking1.policySnapshot.lateFeeToleranceMinutes).toBe(60);
      expect(booking1.policySnapshot.lateFeePercentPerHour).toBe(10);

      // 3. Admin mengubah settings menjadi sangat berbeda (mis. denda naik 30%, toleransi 0)
      await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lateFeeToleranceMinutes: 0,
          lateFeePercentPerHour: 30,
          cancellationThresholdHours: 72,
          cancellationRefundPercent: 10,
        });

      // 4. Buat Booking 2 (dengan policy baru)
      const createRes2 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: motor.id,
          startDate: '2026-11-10',
          endDate: '2026-11-12',
          renter: validRenter,
          pickup: 'store',
        });

      expect(createRes2.status).toBe(201);
      const booking2 = createRes2.body.data;
      expect(booking2.policySnapshot.lateFeeToleranceMinutes).toBe(0);
      expect(booking2.policySnapshot.lateFeePercentPerHour).toBe(30);

      // 5. Verifikasi Booking 1 TETAP mempertahankan snapshot aslinya di database
      const fetchedBooking1 = await bookingRepo.findById(booking1.id);
      expect(fetchedBooking1.policySnapshot.lateFeeToleranceMinutes).toBe(60);
      expect(fetchedBooking1.policySnapshot.lateFeePercentPerHour).toBe(10);

      // 6. Verifikasi perhitungan Denda Pengembalian menggunakan SNAPSHOT masing-masing booking
      // Kasus keterlambatan 45 menit:
      // Booking 1 (toleransi 60 menit): terlambat 45 menit -> di bawah toleransi 60 menit -> denda = 0
      const summary1 = await returnService.calculateReturnSummary(
        fetchedBooking1,
        '2026-11-07T09:45:00+07:00'
      );
      expect(summary1.isOverdue).toBe(false);
      expect(summary1.lateFee).toBe(0);

      // Booking 2 (toleransi 0 menit): terlambat 45 menit -> melebihi toleransi 0 menit -> kena denda 30% per jam!
      const fetchedBooking2 = await bookingRepo.findById(booking2.id);
      const summary2 = await returnService.calculateReturnSummary(
        fetchedBooking2,
        '2026-11-12T09:45:00+07:00'
      );
      expect(summary2.isOverdue).toBe(true);
      expect(summary2.lateFee).toBeGreaterThan(0);
    });

    test('Kalkulasi refund pembatalan memakai snapshot booking (bukan pengaturan terbaru)', () => {
      // Booking A punya snapshot: 48 jam = 100%, 24 jam = 50%, 0 jam = 0%
      const snapshotA = {
        cancellationPolicy: [
          { thresholdHours: 48, refundPercent: 100 },
          { thresholdHours: 24, refundPercent: 50 },
          { thresholdHours: 0, refundPercent: 0 },
        ],
      };

      // Booking B punya snapshot ketat: 72 jam = 80%, 48 jam = 20%, 0 jam = 0%
      const snapshotB = {
        cancellationPolicy: [
          { thresholdHours: 72, refundPercent: 80 },
          { thresholdHours: 48, refundPercent: 20 },
          { thresholdHours: 0, refundPercent: 0 },
        ],
      };

      // Uji pembatalan pada 30 jam sebelum mulai sewa:
      // Untuk Booking A: 30 jam >= 24 jam -> refund 50%
      const refundA = calculateCancellationRefund({
        status: 'confirmed',
        hoursUntilStart: 30,
        totalRental: 200000,
        deposit: 100000,
        policySnapshot: snapshotA,
      });
      expect(refundA.refundPercentage).toBe(50);
      expect(refundA.refundAmount).toBe(100000 + 100000); // 50% rental + 100% deposit

      // Untuk Booking B: 30 jam < 48 jam -> refund 0% biaya sewa (hanya deposit)
      const refundB = calculateCancellationRefund({
        status: 'confirmed',
        hoursUntilStart: 30,
        totalRental: 200000,
        deposit: 100000,
        policySnapshot: snapshotB,
      });
      expect(refundB.refundPercentage).toBe(0);
      expect(refundB.refundAmount).toBe(100000); // 0% rental + 100% deposit
    });
  });

  describe('4. Fallback Default & Ketahanan Sistem', () => {
    test('Sistem berjalan lancar dengan nilai default saat tabel atau cache kosong', async () => {
      settingsService.invalidateCache();
      const settings = await settingsService.getSettings();

      expect(settings).toBeDefined();
      expect(settings.minRentalDays).toBe(1);
      expect(settings.maxRentalDays).toBe(30);
      expect(settings.bookingExpireMinutes).toBe(60);
      expect(settings.defaultDeposit).toBe(200000);
    });
  });
});
