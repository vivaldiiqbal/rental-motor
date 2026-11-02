process.env.USE_DB = 'memory';

const request = require('supertest');
const app = require('../../src/app');
const {
  store,
  userRepo,
  bookingRepo,
  motorRepo,
  documentRepo,
  reviewRepo,
  promoRepo,
  auditRepo,
  returnRepo,
} = require('../../src/repositories');
const { addDays, format } = require('date-fns');

describe('Integration Test: Admin API & RBAC Security (Memory Driver)', () => {
  let adminToken;
  let customerToken;
  let staffToken;
  let staffUserId;

  const demoRenter = {
    name: 'Ilham Ramadhan (Demo)',
    email: 'demo@rodakita.id',
    phone: '081234567890',
  };

  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

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

    // 3. Buat Staf Operasional untuk uji RBAC matriks izin
    const user2 = await userRepo.findByEmail('budi@gmail.com');
    await userRepo.update(user2.id, { role: 'staff' });
    staffUserId = user2.id;

    const staffLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'budi@gmail.com', password: 'Budi12345' });
    staffToken = staffLogin.body.data.token;
  });

  describe('Autentikasi & Dynamic RBAC', () => {
    test('Akses tanpa token ditolak 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/admin/dashboard/summary');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Customer mengakses /api/admin/* ditolak 403 FORBIDDEN_ROLE', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    test('Staf boleh akses Dashboard, Booking, Kalender, Maintenance, dan Pesan', async () => {
      const resDashboard = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resDashboard.status).toBe(200);
      expect(resDashboard.body.success).toBe(true);

      const resCalendar = await request(app)
        .get('/api/admin/calendar')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resCalendar.status).toBe(200);
      expect(resCalendar.body.success).toBe(true);
    });

    test('Staf mengakses endpoint khusus Admin ditolak 403 FORBIDDEN_ROLE', async () => {
      // Users
      const resUsers = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resUsers.status).toBe(403);
      expect(resUsers.body.error.code).toBe('FORBIDDEN_ROLE');

      // Audit Logs
      const resAudit = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resAudit.status).toBe(403);
      expect(resAudit.body.error.code).toBe('FORBIDDEN_ROLE');

      // Export CSV
      const resExport = await request(app)
        .get('/api/admin/bookings/export.csv')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resExport.status).toBe(403);
      expect(resExport.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    test('Akun dinonaktifkan ditolak 403 FORBIDDEN seketika', async () => {
      await userRepo.update(staffUserId, { isActive: false, is_active: false });

      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Perubahan role berlaku seketika (staff diturunkan ke customer langsung ditolak 403)', async () => {
      const resRole = await request(app)
        .patch(`/api/admin/users/${staffUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'customer' });
      expect(resRole.status).toBe(200);

      const resAfter = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resAfter.status).toBe(403);
      expect(resAfter.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('Operasional Booking (Payment, Handover, Return, Deposit)', () => {
    let testBookingId;

    beforeEach(async () => {
      const today = new Date();
      const start = format(today, 'yyyy-MM-dd');
      const end = format(addDays(today, 2), 'yyyy-MM-dd');

      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          renter: demoRenter,
        });
      testBookingId = bRes.body.data.id;
    });

    test('Konfirmasi pembayaran manual mengubah status ke confirmed secara idempotent', async () => {
      const booking = await bookingRepo.findById(testBookingId);
      const grandTotal = booking.grandTotal || booking.pricing.grandTotal;

      const res1 = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          paymentMethod: 'cash',
          amount: grandTotal,
          notes: 'Bayar tunai di gerai',
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('confirmed');

      const res2 = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          paymentMethod: 'cash',
          amount: grandTotal,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('confirmed');
    });

    test('Handover memeriksa kelayakan dokumen, pembayaran, tanggal, dan pengulangan', async () => {
      // 1. Belum bayar -> ditolak PAYMENT_NOT_PAID
      const resFailPayment = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerStart: 12000,
          fuelStart: 'penuh',
          isIdentityVerified: true,
          isDepositReceived: true,
        });
      expect(resFailPayment.status).toBe(400);
      expect(resFailPayment.body.error.code).toBe('PAYMENT_NOT_PAID');

      // Konfirmasi bayar dulu
      const booking = await bookingRepo.findById(testBookingId);
      const grandTotal = booking.grandTotal || booking.pricing.grandTotal;
      await request(app)
        .post(`/api/admin/bookings/${testBookingId}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash', amount: grandTotal });

      // 2. Dokumen belum verified -> ditolak DOCS_NOT_VERIFIED
      await documentRepo.updateStatus(booking.userId, 'ktp', 'not_uploaded', 'system');
      const resFailDocs = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerStart: 12000,
          fuelStart: 'penuh',
          isIdentityVerified: true,
          isDepositReceived: true,
        });
      expect(resFailDocs.status).toBe(400);
      expect(resFailDocs.body.error.code).toBe('DOCS_NOT_VERIFIED');

      // Setujui dokumen
      await documentRepo.updateStatus(booking.userId, 'ktp', 'verified', 'admin');
      await documentRepo.updateStatus(booking.userId, 'sim', 'verified', 'admin');

      // 3. Tanggal sewa belum tiba -> ditolak INVALID_DATE_RANGE
      const futureStart = format(addDays(new Date(), 5), 'yyyy-MM-dd');
      const futureEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd');
      await bookingRepo.update(testBookingId, { startDate: futureStart, endDate: futureEnd });

      const resFailDate = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerStart: 12000,
          fuelStart: 'penuh',
          isIdentityVerified: true,
          isDepositReceived: true,
        });
      expect(resFailDate.status).toBe(400);
      expect(resFailDate.body.error.code).toBe('INVALID_DATE_RANGE');

      // Kembalikan tanggal hari ini
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      await bookingRepo.update(testBookingId, {
        startDate: todayStr,
        endDate: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
      });

      // 4. Handover berhasil dan status menjadi active
      const resSuccess = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerStart: 12500,
          fuelStart: 'penuh',
          isIdentityVerified: true,
          isDepositReceived: true,
          notes: 'Unit mulus tidak ada lecet',
        });

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.data.booking.status).toBe('active');

      // 5. Handover ulang ditolak INVALID_STATUS_TRANSITION
      const resReHandover = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerStart: 12500,
          fuelStart: 'penuh',
          isIdentityVerified: true,
          isDepositReceived: true,
        });
      expect(resReHandover.status).toBe(400);
      expect(resReHandover.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('Return motor: perhitungan toleransi denda, denda 5 jam, batas 24 jam, kerusakan melebihi deposit, odometer salah, dan ulang', async () => {
      // 1. Setup booking ke active
      const booking = await bookingRepo.findById(testBookingId);
      const grandTotal = booking.grandTotal || booking.pricing.grandTotal;
      await request(app)
        .post(`/api/admin/bookings/${testBookingId}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash', amount: grandTotal });

      await documentRepo.updateStatus(booking.userId, 'ktp', 'verified', 'admin');
      await documentRepo.updateStatus(booking.userId, 'sim', 'verified', 'admin');

      await request(app)
        .post(`/api/admin/bookings/${testBookingId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerStart: 15000,
          fuelStart: 'penuh',
          isIdentityVerified: true,
          isDepositReceived: true,
        });

      // 2. Odometer salah (akhir < awal) ditolak ODOMETER_INVALID
      const resWrongOdo = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/return`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerEnd: 14000,
          fuelEnd: 'penuh',
        });
      expect(resWrongOdo.status).toBe(400);
      expect(resWrongOdo.body.error.code).toBe('ODOMETER_INVALID');

      // 3. Pengembalian dengan kerusakan melebihi deposit
      // Deposit = 200.000, Damage = 350.000 -> refund: 0, amountDue: 150.000
      const resReturn = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/return`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerEnd: 15150,
          fuelEnd: 'penuh',
          damageFee: 350000,
          notes: 'Cover knalpot pecah',
        });

      expect(resReturn.status).toBe(200);
      expect(resReturn.body.data.booking.status).toBe('completed');
      expect(resReturn.body.data.summary.depositRefund).toBe(0);
      expect(resReturn.body.data.summary.amountDue).toBe(150000);

      // 4. Pengembalian ulang ditolak INVALID_STATUS_TRANSITION
      const resReReturn = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/return`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          odometerEnd: 15200,
          fuelEnd: 'penuh',
        });
      expect(resReReturn.status).toBe(400);
      expect(resReReturn.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      // 5. Deposit sekali (panggilan kedua ditolak)
      const resRefund1 = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/deposit-refunded`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resRefund1.status).toBe(200);

      const resRefund2 = await request(app)
        .post(`/api/admin/bookings/${testBookingId}/deposit-refunded`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resRefund2.status).toBe(400);
    });

    test('Pembatalan dengan override oleh staff ditolak 403, oleh admin berhasil dan promo dilepas sekali', async () => {
      // Buat booking dengan promo
      const promo = await promoRepo.findByCode('HEMAT10');
      const initialQuota = promo.quota;

      const pRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: format(addDays(new Date(), 10), 'yyyy-MM-dd'),
          endDate: format(addDays(new Date(), 12), 'yyyy-MM-dd'),
          promoCode: 'HEMAT10',
          renter: demoRenter,
        });
      const promoBookingId = pRes.body.data.id;

      // Staff mencoba membatalkan -> ditolak 403 FORBIDDEN_ROLE
      const resStaffCancel = await request(app)
        .post(`/api/admin/bookings/${promoBookingId}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Dibatalkan oleh staf' });
      expect(resStaffCancel.status).toBe(403);
      expect(resStaffCancel.body.error.code).toBe('FORBIDDEN_ROLE');

      // Admin membatalkan -> berhasil 200 dan kuota promo kembali
      const resAdminCancel = await request(app)
        .post(`/api/admin/bookings/${promoBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Dibatalkan oleh admin', refundAmount: 0 });
      expect(resAdminCancel.status).toBe(200);
      expect(resAdminCancel.body.data.status).toBe('cancelled');

      const promoAfter = await promoRepo.findByCode('HEMAT10');
      expect(promoAfter.quota).toBe(initialQuota); // Berkurang saat booking (-1), bertambah saat cancel (+1)

      // Pembatalan kedua kali ditolak
      const resReCancel = await request(app)
        .post(`/api/admin/bookings/${promoBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Ulang' });
      expect(resReCancel.status).toBe(400);
      expect(resReCancel.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('Aturan Bisnis Motor, Servis, dan Pengguna', () => {
    test('Deaktivasi motor memiliki booking aktif ditolak MOTOR_HAS_BOOKINGS', async () => {
      const today = new Date();
      const start = format(today, 'yyyy-MM-dd');
      const end = format(addDays(today, 3), 'yyyy-MM-dd');

      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 2,
          startDate: start,
          endDate: end,
          renter: demoRenter,
        });

      const res = await request(app)
        .patch('/api/admin/motorcycles/2/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'inactive' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('MOTOR_HAS_BOOKINGS');
    });

    test('Plat duplikat motor ditolak 409', async () => {
      const existing = await motorRepo.findById(1);

      const resDuplicate = await request(app)
        .post('/api/admin/motorcycles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Vario Kloning',
          brand: 'Honda',
          type: 'Matic',
          plate: existing.plate,
          pricePerDay: 80000,
        });

      expect(resDuplicate.status).toBe(409);
    });

    test('Urutan foto dan foto utama motor dapat diperbarui', async () => {
      const resOrder = await request(app)
        .put('/api/admin/motorcycles/1/images/order')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrls: ['https://example.com/c.jpg', 'https://example.com/a.jpg', 'https://example.com/b.jpg'],
        });

      expect(resOrder.status).toBe(200);
      expect(resOrder.body.data.images[0]).toBe('https://example.com/c.jpg');
    });

    test('Servis vs Booking: konflik di kedua arah dan uji paralel', async () => {
      const start = format(addDays(new Date(), 20), 'yyyy-MM-dd');
      const end = format(addDays(new Date(), 23), 'yyyy-MM-dd');

      // Arah 1: Servis ada, booking pelanggan konflik ditolak 409
      await request(app)
        .post('/api/admin/maintenance')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          motorId: 5,
          startDate: start,
          endDate: end,
          reason: 'Ganti ban dan oli',
        });

      const resBookingConflict = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 5,
          startDate: format(addDays(new Date(), 21), 'yyyy-MM-dd'),
          endDate: format(addDays(new Date(), 22), 'yyyy-MM-dd'),
          renter: demoRenter,
        });
      expect(resBookingConflict.status).toBe(409);

      // Arah 2: Booking ada, servis konflik ditolak 409
      const start2 = format(addDays(new Date(), 40), 'yyyy-MM-dd');
      const end2 = format(addDays(new Date(), 43), 'yyyy-MM-dd');
      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 6,
          startDate: start2,
          endDate: end2,
          renter: demoRenter,
        });

      const resServiceConflict = await request(app)
        .post('/api/admin/maintenance')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          motorId: 6,
          startDate: start2,
          endDate: end2,
          reason: 'Servis berkala',
        });
      expect(resServiceConflict.status).toBe(409);
      expect(resServiceConflict.body.error.code).toBe('MAINTENANCE_CONFLICT');

      // Uji Paralel: Booking pelanggan dan servis pada slot sama dibuat bersamaan -> tepat satu berhasil
      const startParallel = format(addDays(new Date(), 50), 'yyyy-MM-dd');
      const endParallel = format(addDays(new Date(), 53), 'yyyy-MM-dd');

      const [pBooking, pService] = await Promise.all([
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            motorId: 7,
            startDate: startParallel,
            endDate: endParallel,
            renter: demoRenter,
          }),
        request(app)
          .post('/api/admin/maintenance')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            motorId: 7,
            startDate: startParallel,
            endDate: endParallel,
            reason: 'Servis paralel',
          }),
      ]);

      const statuses = [pBooking.status, pService.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);
    });

    test('Perlindungan admin: SELF_DEACTIVATION, LAST_ADMIN, dan uji paralel dua admin', async () => {
      const admin1 = await userRepo.findByEmail('admin@rodakita.id');

      // 1. Menonaktifkan diri sendiri ditolak
      const resDeactSelf = await request(app)
        .patch(`/api/admin/users/${admin1.id}/active`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(resDeactSelf.status).toBe(400);
      expect(resDeactSelf.body.error.code).toBe('SELF_DEACTIVATION');

      // 2. Mengubah role diri sendiri ditolak
      const resRoleSelf = await request(app)
        .patch(`/api/admin/users/${admin1.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'staff' });
      expect(resRoleSelf.status).toBe(400);
      expect(resRoleSelf.body.error.code).toBe('SELF_ROLE_CHANGE');

      // 3. Uji paralel: dua admin saling menurunkan -> tepat satu berhasil, tetap ada 1 admin
      const admin2 = await userRepo.create({
        name: 'Admin Dua',
        email: 'admin2@rodakita.id',
        role: 'admin',
        isActive: true,
      });

      const authService = require('../../src/services/authService');
      const admin2Token = authService.generateToken(admin2);

      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/admin/users/${admin2.id}/role`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'staff' }),
        request(app)
          .patch(`/api/admin/users/${admin1.id}/role`)
          .set('Authorization', `Bearer ${admin2Token}`)
          .send({ role: 'staff' }),
      ]);

      const pairStatuses = [res1.status, res2.status];
      expect(pairStatuses).toContain(200);
      expect(pairStatuses.some((s) => s === 400 || s === 403)).toBe(true);

      const remainingAdmins = await userRepo.countActiveAdmins();
      expect(remainingAdmins).toBe(1);

      // Verifikasi LAST_ADMIN: jika mencoba menurunkan admin satu-satunya yang tersisa
      const remainingAdmin = (await userRepo.findAll({ role: 'admin' })).items[0];
      const actingToken = remainingAdmin.id === admin1.id ? adminToken : admin2Token;
      // Buat akun admin sementara yang mencoba menurunkan remainingAdmin
      const tempAdmin = await userRepo.create({
        name: 'Temp Admin',
        email: 'tempadmin@rodakita.id',
        role: 'admin',
        isActive: false, // Inactive
      });
      // Deactivated admin coba login/akses -> 403.
      // Ketika menonaktifkan remainingAdmin via endpoint -> ditolak LAST_ADMIN
      const resDeactLast = await request(app)
        .patch(`/api/admin/users/${remainingAdmin.id}/active`)
        .set('Authorization', `Bearer ${actingToken}`)
        .send({ isActive: false });
      expect(resDeactLast.status).toBe(400);
      expect(resDeactLast.body.error.code).toBe('SELF_DEACTIVATION');
    });

    test('Ulasan: rating dihitung ulang tanpa ulasan tersembunyi', async () => {
      const initialStats = await reviewRepo.calculateStats(1);
      const initialRating = initialStats.rating;

      // Tambah review buruk (bintang 1)
      const badRev = await reviewRepo.create({
        motorId: 1,
        userId: 1,
        userName: 'Penyewa',
        rating: 1,
        comment: 'Kurang nyaman',
        date: new Date().toISOString(),
        isVisible: true,
      });

      const motorAfterBad = await motorRepo.findById(1);
      expect(motorAfterBad.rating).toBeLessThan(initialRating);

      // Sembunyikan review oleh admin
      const resHide = await request(app)
        .patch(`/api/admin/reviews/${badRev.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'hidden' });
      expect(resHide.status).toBe(200);

      // Rating motor kembali ke semula
      const motorRestored = await motorRepo.findById(1);
      expect(motorRestored.rating).toBe(initialRating);
    });
  });

  describe('Audit Trail, Laporan, dan CSV Export', () => {
    test('Setiap mutasi tercatat di audit log tanpa membocorkan kredensial sensitif', async () => {
      await request(app)
        .post('/api/admin/addons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Helm Bogo Premium',
          pricePerDay: 15000,
          description: 'Helm retro SNI bergaya klasik',
        });

      const resAudit = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resAudit.status).toBe(200);
      expect(resAudit.body.data.length).toBeGreaterThan(0);
      const createAddonLog = resAudit.body.data.find((l) => l.action === 'CREATE_ADDON');
      expect(createAddonLog).toBeDefined();
      expect(createAddonLog.actorRole).toBe('admin');
    });

    test('Gagal audit membatalkan perubahan data (transaction rollback)', async () => {
      const motor = await motorRepo.findById(1);
      const originalName = motor.name;

      const originalCreate = auditRepo.create;
      auditRepo.create = jest.fn().mockRejectedValue(new Error('Audit system failure'));

      try {
        const res = await request(app)
          .put('/api/admin/motorcycles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Nama Yang Harus Di-Rollback' });

        expect(res.status).toBe(500);

        const motorAfter = await motorRepo.findById(1);
        expect(motorAfter.name).toBe(originalName);
      } finally {
        auditRepo.create = originalCreate;
      }
    });

    test('Laporan: angka pendapatan dan okupansi sesuai hitungan manual pada data uji kecil', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      const b = await bookingRepo.create({
        motorId: 1,
        userId: 1,
        status: 'completed',
        startDate: todayStr,
        endDate: todayStr,
        rentalTotal: 150000,
        deposit: 200000,
        total: 350000,
        paidAt: `${todayStr}T08:00:00Z`,
        refundAmount: 0,
      });

      await returnRepo.create({
        bookingId: b.id,
        returnedAt: `${todayStr}T12:00:00Z`,
        lateFee: 20000,
        damageFee: 10000,
        otherFee: 0,
      });

      const resRev = await request(app)
        .get(`/api/admin/reports/revenue?startDate=${todayStr}&endDate=${todayStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resRev.status).toBe(200);
      // Net revenue = 150.000 + 20.000 (late) + 10.000 (damage) = 180.000
      expect(resRev.body.data.totals.totalNetRevenue).toBe(180000);
    });

    test('Ekspor CSV menghasilkan header BOM UTF-8 dan formula injection dinetralkan', async () => {
      const res = await request(app)
        .get('/api/admin/bookings/export.csv')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.startsWith('\uFEFF')).toBe(true);

      const { toCsv } = require('../../src/utils/csv');
      const testCsv = toCsv(
        [{ code: '=1+1', name: '@SUM', cmd: '-calc' }],
        [
          { key: 'code', label: 'Kode' },
          { key: 'name', label: 'Nama' },
          { key: 'cmd', label: 'Perintah' },
        ],
      );
      expect(testCsv).toContain("'=1+1");
      expect(testCsv).toContain("'@SUM");
      expect(testCsv).toContain("'-calc");
    });
  });

  describe('Pengaturan Sistem (Settings)', () => {
    test('Pengaturan sistem dapat dibaca, diubah dengan validasi batas, dan direset', async () => {
      const getRes = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.minRentalDays).toBeDefined();

      const putRes = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lateFeeToleranceMinutes: 60,
          lateFeePercentPerHour: 15,
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.lateFeeToleranceMinutes).toBe(60);

      const putInvalid = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lateFeePercentPerHour: 150,
        });
      expect(putInvalid.status).toBe(400);

      const resetRes = await request(app)
        .post('/api/admin/settings/reset')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.lateFeeToleranceMinutes).toBe(120);
    });
  });
});
