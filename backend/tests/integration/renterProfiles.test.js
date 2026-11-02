const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../src/app');
const { pool } = require('../../db/pool');
const { store } = require('../../src/repositories');
const { addDays, format } = require('date-fns');

describe('Integration Test: Renter Profiles, Readiness & Snapshot Immutability', () => {
  let adminToken;
  let demoToken;
  let demoUserId;
  let budiToken;
  let budiUserId;

  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    // Login Admin
    const aRes = await request(app).post('/api/auth/login').send({
      email: 'admin@rodakita.id',
      password: 'Admin12345',
    });
    adminToken = aRes.body.data.token;

    // Login Demo User (User 1 - Profil Lengkap & Dokumen Verified)
    const dRes = await request(app).post('/api/auth/login').send({
      email: 'demo@rodakita.id',
      password: 'Demo12345',
    });
    demoToken = dRes.body.data.token;
    demoUserId = dRes.body.data.user.id;

    // Login Budi (User 2 - Profil Belum Lengkap di Seed)
    const bRes = await request(app).post('/api/auth/login').send({
      email: 'budi@gmail.com',
      password: 'Budi12345',
    });
    budiToken = bRes.body.data.token;
    budiUserId = bRes.body.data.user.id;
  });

  describe('1. Validasi Ketat Input Profil Penyewa (PUT /api/auth/renter-profile)', () => {
    test('Menolak nomor darurat yang sama persis dengan nomor telepon penyewa', async () => {
      const res = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Ilham Ramadhan',
          birthDate: '1995-05-15',
          nik: '5171010101950001',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road No. 88, Kuta, Bali',
          stayAddress: 'Hotel Grand Kuta',
          emergencyName: 'Siti Rahma',
          emergencyRelation: 'pasangan',
          emergencyPhone: '081234567890', // SAMA DENGAN NOMOR SENDIRI
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/tidak boleh sama/i);
    });

    test('Menolak nama KTP yang hanya 1 kata atau mengandung angka/simbol', async () => {
      const res = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Ilham123',
          birthDate: '1995-05-15',
          nik: '5171010101950001',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road',
          stayAddress: 'Hotel Grand Kuta',
          emergencyName: 'Siti Rahma',
          emergencyRelation: 'pasangan',
          emergencyPhone: '081299998888',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/nama lengkap/i);
    });

    test('Menolak penyewa yang berusia di bawah 18 tahun', async () => {
      const underAgeDob = format(addDays(new Date(), -16 * 365), 'yyyy-MM-dd');
      const res = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Adik Remaja',
          birthDate: underAgeDob,
          nik: '5171010101950001',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road',
          stayAddress: 'Hotel Grand Kuta',
          emergencyName: 'Ibu Ramadhan',
          emergencyRelation: 'orang tua',
          emergencyPhone: '081299998888',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/minimal (17|18) tahun/i);
    });

    test('Menolak format NIK selain 16 digit angka murni', async () => {
      const res = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Ilham Ramadhan',
          birthDate: '1995-05-15',
          nik: '31710123456ABCDE',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road',
          stayAddress: 'Hotel Grand Kuta',
          emergencyName: 'Siti Rahma',
          emergencyRelation: 'pasangan',
          emergencyPhone: '081299998888',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/NIK/i);
    });
  });

  describe('2. Pencegahan Duplikasi NIK pada Akun Berbeda (NIK Uniqueness)', () => {
    test('Menolak jika akun Budi mendaftarkan NIK yang sudah dimiliki akun Ilham', async () => {
      // 1. Ilham mendaftarkan NIK unik 5171010101950001
      const resIlham = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Ilham Ramadhan',
          birthDate: '1995-05-15',
          nik: '5171010101950001',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road No. 88, Kuta',
          stayAddress: 'Hotel Grand Kuta',
          emergencyName: 'Siti Rahma',
          emergencyRelation: 'pasangan',
          emergencyPhone: '081299998888',
          termsAccepted: true,
          gpsConsent: true,
        });
      expect(resIlham.status).toBe(200);

      // 2. Budi mencoba mendaftarkan NIK yang persis sama
      const resBudi = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${budiToken}`)
        .send({
          fullNameKtp: 'Budi Santoso',
          birthDate: '1998-08-20',
          nik: '5171010101950001', // NIK KEMBAR
          phone: '081987654321',
          addressKtp: 'Jl. Malioboro No. 12',
          stayAddress: 'Villa Seminyak',
          emergencyName: 'Joko Santoso',
          emergencyRelation: 'saudara',
          emergencyPhone: '081812345678',
          termsAccepted: true,
          gpsConsent: true,
        });

      expect(resBudi.status).toBe(409);
      expect(resBudi.body.success).toBe(false);
      expect(resBudi.body.error.code).toBe('NIK_ALREADY_REGISTERED');
    });
  });

  describe('3. Keamanan: Reset Otomatis Status Dokumen saat Identitas Kunci Diubah', () => {
    test('Mengubah Nama KTP pada akun yang terverifikasi otomatis mereset dokumen ke pending & mencatat audit', async () => {
      // Verifikasi awal: Ilham memiliki dokumen verified di seed
      const meBefore = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${demoToken}`);
      expect(meBefore.body.data.documents.ktp).toBe('verified');

      // Update identitas kunci: ganti Nama KTP
      const updateRes = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Ilham Ramadhan Al-Farisi', // Berubah
          birthDate: '1995-05-15',
          nik: '5171010101950001',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road No. 88, Kuta',
          stayAddress: 'Hotel Grand Kuta',
          emergencyName: 'Siti Rahma',
          emergencyRelation: 'pasangan',
          emergencyPhone: '081299998888',
          termsAccepted: true,
          gpsConsent: true,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.resetDocsToPending).toBe(true);

      // Cek status dokumen akun setelah direset
      const meAfter = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${demoToken}`);
      expect(meAfter.body.data.documents.ktp).toBe('pending');
      expect(meAfter.body.data.documents.sim).toBe('pending');

      // Jika menggunakan PostgreSQL, pastikan audit log tercatat
      if (process.env.USE_DB === 'postgres') {
        const auditRes = await pool.query(
          "SELECT action, after FROM audit_logs WHERE actor_id = $1 AND action = 'DOCUMENT_STATUS_RESET' ORDER BY id DESC LIMIT 1",
          [demoUserId],
        );
        expect(auditRes.rows.length).toBe(1);
        expect(auditRes.rows[0].action).toBe('DOCUMENT_STATUS_RESET');
      }
    });
  });

  describe('4. Pembatasan Pembuatan Booking (createBooking Gate)', () => {
    test('Pengguna baru tanpa kelengkapan profil ditolak dengan 403 PROFILE_INCOMPLETE', async () => {
      // Daftarkan akun baru yang belum memiliki renter profile
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Pelanggan Baru Polosan',
          email: 'polosan@example.com',
          phone: '081288887777',
          password: 'Password123',
        });
      expect(regRes.status).toBe(201);
      const newUserToken = regRes.body.data.token;

      const start = format(addDays(new Date(), 5), 'yyyy-MM-dd');
      const end = format(addDays(new Date(), 7), 'yyyy-MM-dd');

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${newUserToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: {
            name: 'Pelanggan Baru Polosan',
            email: 'polosan@example.com',
            phone: '081288887777',
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PROFILE_INCOMPLETE');
      expect(res.body.error.details.missingFields).toBeDefined();
      expect(res.body.error.details.missingFields.length).toBeGreaterThan(0);
    });

    test('Akun Ilham dengan profil lengkap berhasil membuat booking dan mengunci renterSnapshot', async () => {
      const start = format(addDays(new Date(), 8), 'yyyy-MM-dd');
      const end = format(addDays(new Date(), 10), 'yyyy-MM-dd');

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: {
            name: 'Ketik Bebas di Client', // Nilai input bebas diabaikan oleh server
            email: 'demo@rodakita.id',
            phone: '089999999999',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const booking = res.body.data;
      expect(booking.renterSnapshot).toBeDefined();
      // Data nama dan telepon resmi diambil dari profil KTP, bukan teks bebas
      expect(booking.renterSnapshot.fullNameKtp).toBe('Ilham Ramadhan');
      expect(booking.renterSnapshot.phoneE164).toBe('+6281234567890');
      expect(booking.renterSnapshot.emergencyContact.name).toBe('Siti Rahma');
      expect(booking.renterSnapshot.emergencyContact.relation).toBe('pasangan');
      expect(booking.renterSnapshot.emergencyContact.phone).toBe('+6281299998888');
    });
  });

  describe('5. Immutabilitas Snapshot Profil pada Booking Masa Lalu', () => {
    test('Perubahan profil pengguna di kemudian hari tidak mengubah renterSnapshot transaksi lama', async () => {
      // 1. Buat booking pertama
      const start = format(addDays(new Date(), 15), 'yyyy-MM-dd');
      const end = format(addDays(new Date(), 17), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Ilham', email: 'demo@rodakita.id', phone: '081234567890' },
        });

      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.data.id;
      const originalEmergencyName = createRes.body.data.renterSnapshot.emergencyContact.name;
      expect(originalEmergencyName).toBe('Siti Rahma');

      // 2. Pengguna memperbarui kontak darurat di profil akunnya
      const updateProfRes = await request(app)
        .put('/api/auth/renter-profile')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          fullNameKtp: 'Ilham Ramadhan',
          birthDate: '1995-05-15',
          nik: '5171010101950001',
          phone: '081234567890',
          addressKtp: 'Jl. Sunset Road No. 88, Kuta',
          stayAddress: 'Hotel Baru di Ubud',
          emergencyName: 'Ahmad Kerabat Baru', // BERUBAH
          emergencyRelation: 'saudara',
          emergencyPhone: '081277776666',
          termsAccepted: true,
          gpsConsent: true,
        });
      expect(updateProfRes.status).toBe(200);

      // 3. Ambil booking yang lama via endpoint pelanggan dan admin
      const custBookingRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${demoToken}`);
      expect(custBookingRes.status).toBe(200);
      // Snapshot lama TETAP Siti Rahma (Immutable)
      expect(custBookingRes.body.data.renterSnapshot.emergencyContact.name).toBe('Siti Rahma');

      const adminBookingRes = await request(app)
        .get(`/api/admin/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminBookingRes.status).toBe(200);
      expect(adminBookingRes.body.data.renterSnapshot.emergencyContact.name).toBe('Siti Rahma');

      // 4. Admin melihat profil akun pengguna terkini melalui endpoint admin renter-profile
      const adminUserProfRes = await request(app)
        .get(`/api/admin/users/${demoUserId}/renter-profile`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminUserProfRes.status).toBe(200);
      // Profil pengguna mutakhir menampilkan kontak yang baru
      expect(adminUserProfRes.body.data.profile.emergencyContact.name).toBe('Ahmad Kerabat Baru');
    });
  });

  describe('6. Pemindaian Regresi Integritas: Nol Data Karangan di Repo', () => {
    test('Tidak ada string karangan "Keluarga Penyewa", "Keluarga Kandung", atau "0812-9876-5432" di src/', () => {
      const srcDir = path.resolve(__dirname, '../../../src');
      const forbiddenStrings = ['Keluarga Penyewa', 'Keluarga Kandung', '0812-9876-5432'];

      function scanDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const bad of forbiddenStrings) {
              if (content.includes(bad)) {
                throw new Error(`Ditemukan data karangan "${bad}" di berkas: ${fullPath}`);
              }
            }
          }
        }
      }

      scanDir(srcDir);
    });
  });
});
