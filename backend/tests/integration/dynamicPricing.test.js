const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const { cleanDatabase } = require('../helpers/dbClean');
const { pool } = require('../../db/pool');
const { pricingRepo, bookingRepo } = require('../../src/repositories');
const pricingService = require('../../src/services/pricingService');

describe('Integration Test: Dynamic Pricing Rules, Tiers & Booking Snapshot Immutability', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let adminUser;
  let customerUser;
  let testMotor;

  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await cleanDatabase();

      // Seed admin, staff, customer
      const aRes = await pool.query(
        `INSERT INTO users (name, email, phone, role, password_hash, is_active)
         VALUES ('Admin Utama', 'admin.pricing@rodakita.com', '081299990001', 'admin', 'hash', true)
         RETURNING id, role`,
      );
      adminUser = aRes.rows[0];

      const sRes = await pool.query(
        `INSERT INTO users (name, email, phone, role, password_hash, is_active)
         VALUES ('Staf Lapangan', 'staff.pricing@rodakita.com', '081299990002', 'staff', 'hash', true)
         RETURNING id, role`,
      );

      const cRes = await pool.query(
        `INSERT INTO users (name, email, phone, role, password_hash, is_active)
         VALUES ('Customer Test', 'cust.pricing@rodakita.com', '081299990003', 'customer', 'hash', true)
         RETURNING id, role`,
      );
      customerUser = cRes.rows[0];

      await pool.query(
        `INSERT INTO renter_profiles (
           user_id, full_name_ktp, birth_date, nik_hash, nik_last4,
           address_ktp, phone_e164, stay_address,
           emergency_name, emergency_relation, emergency_phone,
           terms_version_accepted, privacy_version_accepted, gps_consent_at,
           completed_at, created_at, updated_at
         )
         VALUES ($1, 'Customer Test', '1995-01-01', 'pricing_nik_hash_test', '1234',
                 'Jl. Pricing Test', '+6281299990003', 'Hotel Test',
                 'Keluarga Test', 'orang tua', '+6281299998888',
                 1, 1, now(), now(), now(), now())`,
        [customerUser.id]
      );

      // Seed motor
      const mRes = await pool.query(
        `INSERT INTO motorcycles (name, slug, brand, type, cc, year, color, transmission, fuel_capacity, price_per_day, deposit, status, plate_number)
         VALUES ('Vario 160 Dynamic', 'vario-160-dynamic', 'Honda', 'matic', 160, 2024, 'Hitam', 'automatic', 5.5, 100000, 200000, 'active', 'AB 1234 DY')
         RETURNING id, name, price_per_day`,
      );
      testMotor = mRes.rows[0];
    } else {
      adminUser = { id: 1, role: 'admin' };
      customerUser = { id: 3, role: 'customer' };
      testMotor = { id: 1, name: 'Vario 160 Dynamic', price_per_day: 100000 };
    }

    adminToken = authService.generateToken({ id: adminUser.id, role: 'admin' });
    staffToken = authService.generateToken({ id: 2, role: 'staff' });
    customerToken = authService.generateToken({ id: customerUser.id, role: 'customer' });
  });

  afterEach(() => {
    pricingService.invalidateCache();
  });

  describe('1. Security & RBAC: Pengelolaan Aturan Harga', () => {
    test('Akses tanpa token ditolak dengan 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/admin/pricing-rules');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Staff dan Customer ditolak mengakses endpoint admin pricing dengan 403 FORBIDDEN_ROLE', async () => {
      const staffRes = await request(app)
        .get('/api/admin/pricing-rules')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffRes.status).toBe(403);
      expect(staffRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const custRes = await request(app)
        .post('/api/admin/discount-tiers')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ minDays: 5, discountPercent: 7.5 });
      expect(custRes.status).toBe(403);
      expect(custRes.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('2. Admin CRUD: Aturan Harga (Pricing Rules)', () => {
    let createdRuleId;

    test('Admin dapat melihat daftar aturan harga', async () => {
      const res = await request(app)
        .get('/api/admin/pricing-rules')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('Validasi gagal saat payload aturan harga tidak lengkap', async () => {
      const res = await request(app)
        .post('/api/admin/pricing-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'A' }); // Kurang ruleType, rateType, rateValue
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Admin berhasil membuat aturan harga musiman (seasonal) baru', async () => {
      const payload = {
        name: 'Liburan Akhir Tahun 2026',
        ruleType: 'seasonal',
        rateType: 'fixed',
        rateValue: 30000,
        scope: 'all',
        startDate: '2026-12-20',
        endDate: '2026-12-31',
        priority: 25,
        isActive: true,
        description: 'Biaya tambahan musim puncak liburan akhir tahun',
      };

      const res = await request(app)
        .post('/api/admin/pricing-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.rateValue).toBe(30000);
      createdRuleId = res.body.data.id;
    });

    test('Admin dapat mengupdate aturan harga', async () => {
      const res = await request(app)
        .put(`/api/admin/pricing-rules/${createdRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rateValue: 35000, description: 'Revisi biaya liburan' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rateValue).toBe(35000);
    });

    test('Admin dapat menghapus aturan harga', async () => {
      const res = await request(app)
        .delete(`/api/admin/pricing-rules/${createdRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const checkRes = await request(app)
        .get(`/api/admin/pricing-rules/${createdRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(checkRes.status).toBe(404);
    });
  });

  describe('3. Admin CRUD: Tier Diskon Durasi (Discount Tiers)', () => {
    let createdTierId;

    test('Admin dapat melihat daftar tier diskon', async () => {
      const res = await request(app)
        .get('/api/admin/discount-tiers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('Admin berhasil membuat tier diskon baru', async () => {
      const payload = {
        minDays: 14,
        discountPercent: 15.0,
        description: 'Diskon sewa dua pekan',
        isActive: true,
      };

      const res = await request(app)
        .post('/api/admin/discount-tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.minDays).toBe(14);
      expect(res.body.data.discountPercent).toBe(15);
      createdTierId = res.body.data.id;
    });

    test('Admin dapat memperbarui tier diskon', async () => {
      const res = await request(app)
        .put(`/api/admin/discount-tiers/${createdTierId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ discountPercent: 16.5 });

      expect(res.status).toBe(200);
      expect(res.body.data.discountPercent).toBe(16.5);
    });

    test('Admin dapat menghapus tier diskon', async () => {
      const res = await request(app)
        .delete(`/api/admin/discount-tiers/${createdTierId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('4. Booking Pricing Snapshot Immutability', () => {
    test('Booking lama tidak berubah saat admin mengubah atau menaikkan aturan harga', async () => {
      // 1. Buat aturan seasonal aktif
      const createRuleRes = await request(app)
        .post('/api/admin/pricing-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Peak Holiday Promo Test',
          ruleType: 'seasonal',
          rateType: 'fixed',
          rateValue: 50000,
          scope: 'all',
          startDate: '2026-11-10',
          endDate: '2026-11-20',
          priority: 50,
          isActive: true,
        });
      expect(createRuleRes.status).toBe(201);
      const seasonalRuleId = createRuleRes.body.data.id;

      // 2. Buat booking baru pada rentang tanggal tersebut
      // Sewa 2 hari: 2026-11-12 s/d 2026-11-14
      // Subtotal = 2 x 100.000 = 200.000
      // Seasonal surcharge = 2 x 50.000 = 100.000
      // Rental total = 300.000 + deposit 200.000 = 500.000
      const bookingPayload = {
        motorId: testMotor.id,
        startDate: '2026-11-12',
        endDate: '2026-11-14',
        pickupTime: '09:00',
        pickupLocation: 'Kantor Pusat',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: {
          name: 'Penyewa Snapshot',
          email: 'snapshot@example.com',
          phone: '081234567890',
        },
      };

      const bookingRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(bookingPayload);

      if (bookingRes.status !== 201) {
        console.error('BOOKING ERROR:', JSON.stringify(bookingRes.body, null, 2));
      }
      expect(bookingRes.status).toBe(201);
      const booking = bookingRes.body.data;
      const initialGrandTotal = booking.grandTotal || booking.total;
      expect(initialGrandTotal).toBe(500000);

      // Verifikasi pricingSnapshot tersimpan
      expect(booking.pricingSnapshot).toBeDefined();
      expect(booking.pricingSnapshot.totalSurcharge).toBe(100000);

      // 3. Admin MENGUBAH nilai aturan harga menjadi dua kali lipat (Rp 100.000/hari)
      const updateRuleRes = await request(app)
        .put(`/api/admin/pricing-rules/${seasonalRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rateValue: 100000 });
      expect(updateRuleRes.status).toBe(200);

      // 4. Ambil kembali data booking lama dari database
      const fetchedOldBooking = await bookingRepo.findById(booking.id);
      expect(fetchedOldBooking).toBeDefined();

      // HARGA BOOKING LAMA HARUS TETAP 500.000 (KEBAL TERHADAP PERUBAHAN ATURAN HARGA)
      const oldGrandTotal = fetchedOldBooking.grandTotal || fetchedOldBooking.total;
      expect(oldGrandTotal).toBe(500000);
      expect(fetchedOldBooking.pricingSnapshot.totalSurcharge).toBe(100000);

      // 5. Bersihkan aturan tes
      await request(app)
        .delete(`/api/admin/pricing-rules/${seasonalRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    });
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }
  });
});

