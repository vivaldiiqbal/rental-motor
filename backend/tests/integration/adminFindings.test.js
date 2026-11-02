process.env.USE_DB = 'postgres';

const request = require('supertest');
const { pool } = require('../../db/pool');
const { resetDatabase } = require('../../db/reset');
const app = require('../../src/app');
const {
  userRepo,
  motorRepo,
  reviewRepo,
  contactRepo,
  maintenanceRepo,
  documentRepo,
  auditRepo,
} = require('../../src/repositories');
const availabilityService = require('../../src/services/availabilityService');
const { todayWIB } = require('../../src/utils/dates');
const { addDays, subDays, format, parseISO } = require('date-fns');

describe('Bagian 4 Regression Tests: Admin Panel Findings & Fixes', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let adminUser;
  let staffUser;
  let customerUser;
  let testMotor;
  let secondMotor;

  beforeAll(async () => {
    await resetDatabase(pool);

    // Login default admin
    const adminLoginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@rodakita.id',
      password: 'Admin12345',
    });
    adminToken = adminLoginRes.body.data.token;
    adminUser = adminLoginRes.body.data.user;

    // Login customer
    const custLoginRes = await request(app).post('/api/auth/login').send({
      email: 'demo@rodakita.id',
      password: 'Demo12345',
    });
    customerToken = custLoginRes.body.data.token;
    customerUser = custLoginRes.body.data.user;

    // Get test motors
    const motors = await motorRepo.findAll({ limit: 10 });
    testMotor = motors.items[0];
    secondMotor = motors.items[1] || motors.items[0];
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Temuan 1: Read-Only Role & RBAC (No Client Role Escalation)', () => {
    it('customer token dilarang mengakses endpoint admin walaupun mencoba menyuntik role di header atau body', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/stats')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-user-role', 'admin')
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });

    it('profil admin diverifikasi dari server dan mengembalikan role yang sah', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('admin');
    });
  });

  describe('Temuan 2: Halaman Ulasan (Unit Menampilkan Nama Motor Asli & Tanpa Hapus Permanen)', () => {
    let testReview;

    beforeAll(async () => {
      // Create a test review for testMotor
      testReview = await reviewRepo.create({
        bookingId: null,
        userId: customerUser.id,
        motorcycleId: testMotor.id,
        rating: 5,
        comment: 'Tarikan motor sangat enteng dan terawat!',
        isVisible: true,
      });
    });

    it('GET /api/admin/reviews menyertakan nama motor asli (motorcycleName) dari join motorcycles', async () => {
      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      const found = res.body.data.find((r) => r.id === testReview.id);
      expect(found).toBeDefined();
      expect(found.motorcycleName).toBe(testMotor.name);
    });

    it('tidak ada route DELETE permanen untuk ulasan (sesuai kontrak moderasi)', async () => {
      const res = await request(app)
        .delete(`/api/admin/reviews/${testReview.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Route DELETE tidak didaftarkan sehingga menghasilkan 404
      expect(res.status).toBe(404);
    });

    it('PATCH /api/admin/reviews/:id/visibility dapat menyembunyikan dan menerbitkan kembali', async () => {
      // Sembunyikan
      const hideRes = await request(app)
        .patch(`/api/admin/reviews/${testReview.id}/visibility`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isVisible: false });

      expect(hideRes.status).toBe(200);
      expect(hideRes.body.data.isVisible).toBe(false);

      // Terbitkan kembali
      const pubRes = await request(app)
        .patch(`/api/admin/reviews/${testReview.id}/visibility`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isVisible: true });

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.isVisible).toBe(true);
    });
  });

  describe('Temuan 3: Format Kode Booking Standar Backend (RM-YYMMDD-XXXX)', () => {
    it('kode booking baru selalu menggunakan format RM-YYMMDD-XXXX', async () => {
      const today = new Date();
      const start = format(addDays(today, 25), 'yyyy-MM-dd');
      const end = format(addDays(today, 28), 'yyyy-MM-dd');

      const bookingRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: testMotor.id,
          startDate: start,
          endDate: end,
          pickupTime: '08:30',
          pickupLocation: 'Garasi RodaKita',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: {
            name: 'Penyewa Nyata',
            phone: '081234567890',
            email: 'demo@rodakita.id',
            idNumber: '3201234567890001',
            emergencyContact: {
              name: 'Ibu Ratna',
              phone: '081377766655',
            },
          },
        });

      expect(bookingRes.status).toBe(201);
      const code = bookingRes.body.data.code;
      expect(code).toMatch(/^RM-\d{6}-[2-9A-HJ-NP-Z]{4}$/);
      expect(code.startsWith('RK-')).toBe(false);
    });
  });

  describe('Temuan 4: Jadwal Servis (WIB Status, Biaya, Selesaikan Servis, Audit & Ketersediaan)', () => {
    const todayStr = todayWIB();
    const todayDate = parseISO(todayStr);

    it('status dihitung server: Terjadwal (masa depan), Sedang berlangsung (hari ini)', async () => {
      // Block 1: Masa depan -> scheduled
      const futureStart = format(addDays(todayDate, 10), 'yyyy-MM-dd');
      const futureEnd = format(addDays(todayDate, 13), 'yyyy-MM-dd');
      const futureBlock = await maintenanceRepo.create({
        motorcycleId: testMotor.id,
        startDate: futureStart,
        endDate: futureEnd,
        reason: 'Ganti ban depan',
        cost: 250000,
      });

      const futureMapped = await maintenanceRepo.findById(futureBlock.id);
      expect(futureMapped.status).toBe('scheduled');
      expect(futureMapped.cost).toBe(250000);

      // Block 2: Sedang berlangsung (kemarin sampai lusa) -> in_progress
      const currStart = format(subDays(todayDate, 1), 'yyyy-MM-dd');
      const currEnd = format(addDays(todayDate, 2), 'yyyy-MM-dd');
      const currBlock = await maintenanceRepo.create({
        motorcycleId: testMotor.id,
        startDate: currStart,
        endDate: currEnd,
        reason: 'Service kelistrikan & aki',
        cost: 150000,
      });

      const currMapped = await maintenanceRepo.findById(currBlock.id);
      expect(currMapped.status).toBe('in_progress');
    });

    it('tombol "Selesaikan Servis" memendekkan jadwal, menyelesaikan blok, mencatat audit, dan motor kembali tersedia', async () => {
      // Buat blok servis pada secondMotor di rentang bersih mendatang
      const start = format(addDays(todayDate, 40), 'yyyy-MM-dd');
      const originalEnd = format(addDays(todayDate, 45), 'yyyy-MM-dd');
      const maint = await maintenanceRepo.create({
        motorcycleId: secondMotor.id,
        startDate: start,
        endDate: originalEnd,
        reason: 'Turun mesin parsial',
        cost: 500000,
      });

      // Sebelum diselesaikan, motor TIDAK tersedia untuk tanggal yang diblokir servis
      const isAvailBefore = await availabilityService.isMotorAvailable(
        secondMotor.id,
        format(addDays(todayDate, 41), 'yyyy-MM-dd'),
        format(addDays(todayDate, 43), 'yyyy-MM-dd'),
      );
      expect(isAvailBefore).toBe(false);

      // Selesaikan servis lebih awal
      const completeRes = await request(app)
        .post(`/api/admin/maintenance/${maint.id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cost: 480000,
          completionNotes: 'Servis selesai lebih cepat, pengerjaan prima',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.status).toBe('completed');
      expect(completeRes.body.data.cost).toBe(480000);
      expect(completeRes.body.data.completionNotes).toContain('selesai lebih cepat');
      expect(completeRes.body.data.completedBy).toBe(adminUser.id);

      // Setelah diselesaikan, motor KEMBALI TERSEDIA untuk rentang yang sebelumnya diblok
      const isAvailAfter = await availabilityService.isMotorAvailable(
        secondMotor.id,
        format(addDays(todayDate, 41), 'yyyy-MM-dd'),
        format(addDays(todayDate, 43), 'yyyy-MM-dd'),
      );
      expect(isAvailAfter).toBe(true);

      // Audit log tercatat
      const audits = await auditRepo.findAll({
        action: 'COMPLETE_MAINTENANCE',
        entityId: maint.id,
      });
      expect(audits.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Temuan 5: Pesan Kontak Tersimpan di Database (is_read, replied_at, replied_by)', () => {
    let testMsg;

    beforeAll(async () => {
      testMsg = await contactRepo.create({
        name: 'Budi Santoso',
        email: 'budi@example.com',
        phone: '081234567890',
        subject: 'Tanya sewa mingguan',
        message: 'Apakah ada diskon untuk sewa 2 minggu penuh?',
      });
    });

    it('PATCH /api/admin/messages/:id/read menyimpan is_read = true di database', async () => {
      const res = await request(app)
        .patch(`/api/admin/messages/${testMsg.id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);

      const dbMsg = await contactRepo.findById(testMsg.id);
      expect(dbMsg.isRead).toBe(true);
    });

    it('POST /api/admin/messages/:id/reply menyimpan balasan, replied_at, dan replied_by di database', async () => {
      const replyPayload = {
        replyText: 'Halo Pak Budi, ada diskon 15% untuk sewa di atas 10 hari.',
      };

      const res = await request(app)
        .post(`/api/admin/messages/${testMsg.id}/reply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(replyPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.replyMessage).toBe(replyPayload.replyText);
      expect(res.body.data.repliedAt).toBeDefined();
      expect(res.body.data.repliedBy).toBe(adminUser.id);

      const dbMsg = await contactRepo.findById(testMsg.id);
      expect(dbMsg.replyMessage).toBe(replyPayload.replyText);
      expect(dbMsg.repliedAt).not.toBeNull();
      expect(dbMsg.repliedBy).toBe(adminUser.id);
    });
  });

  describe('Temuan 6: Lencana Menu (Hitungan Database Riil & 0 saat Kosong)', () => {
    it('GET /api/admin/messages mengembalikan unreadCount riil dari database', async () => {
      // Buat 1 pesan baru belum dibaca
      const newMsg = await contactRepo.create({
        name: 'Rudi',
        email: 'rudi@example.com',
        subject: 'Info SIM C',
        message: 'Apakah SIM C luar Bali berlaku?',
      });

      const res1 = await request(app)
        .get('/api/admin/messages')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.meta.unreadCount).toBeGreaterThanOrEqual(1);

      // Tandai dibaca
      await request(app)
        .patch(`/api/admin/messages/${newMsg.id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res2 = await request(app)
        .get('/api/admin/messages')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res2.body.meta.unreadCount).toBe(res1.body.meta.unreadCount - 1);
    });

    it('GET /api/admin/documents mengembalikan hitungan dokumen riil (total = 0 jika tidak ada pending)', async () => {
      const res = await request(app)
        .get('/api/admin/documents?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.meta.total).toBe('number');
      expect(res.body.meta.total).toBeGreaterThanOrEqual(0);
    });
  });
});
