process.env.USE_DB = 'postgres';

const request = require('supertest');
const { pool } = require('../../db/pool');
const app = require('../../src/app');
const { todayWIB } = require('../../src/utils/dates');
const { addDays, format, parseISO } = require('date-fns');

describe('Regression Tests: Admin Booking Actions & Lifecycle', () => {
  let adminToken;
  let staffToken;
  let customerUser;
  let testMotorId;
  const createdBookingIds = [];
  let bookingCounter = 0;

  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    // 1. Login Admin
    const adminRes = await request(app).post('/api/auth/login').send({
      email: 'admin@rodakita.id',
      password: 'Admin12345',
    });
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.data.token;

    // 2. Login Staff
    const staffRes = await request(app).post('/api/auth/login').send({
      email: 'staff@rodakita.id',
      password: 'Staff12345',
    });
    expect(staffRes.status).toBe(200);
    staffToken = staffRes.body.data.token;

    // 3. Get customer & motor for tests
    const custRes = await pool.query("SELECT id, name, email FROM users WHERE role = 'customer' LIMIT 1");
    customerUser = custRes.rows[0];

    const motorRes = await pool.query("SELECT id FROM motorcycles WHERE status = 'available' LIMIT 1");
    testMotorId = motorRes.rows[0]?.id || 1;
  });

  afterAll(async () => {
    // Cleanup only test bookings created during this test
    if (createdBookingIds.length > 0) {
      await pool.query('DELETE FROM booking_handovers WHERE booking_id = ANY($1)', [createdBookingIds]);
      await pool.query('DELETE FROM booking_returns WHERE booking_id = ANY($1)', [createdBookingIds]);
      await pool.query('DELETE FROM payments WHERE booking_id = ANY($1)', [createdBookingIds]);
      await pool.query('DELETE FROM booking_timeline WHERE booking_id = ANY($1)', [createdBookingIds]);
      await pool.query('DELETE FROM bookings WHERE id = ANY($1)', [createdBookingIds]);
    }
    if (customerUser?.id) {
      await pool.query('DELETE FROM user_documents WHERE user_id = $1', [customerUser.id]);
    }
  });

  // Helper to create test booking directly in DB
  async function createTestBooking(overrides = {}) {
    bookingCounter += 1;
    const today = todayWIB();
    const start = overrides.startDate || format(addDays(parseISO(today), 20 + (bookingCounter * 5)), 'yyyy-MM-dd');
    const end = overrides.endDate || format(addDays(parseISO(today), 22 + (bookingCounter * 5)), 'yyyy-MM-dd');
    const code = overrides.code || `TEST-${Date.now()}-${bookingCounter}-${Math.floor(Math.random() * 1000)}`;
    const status = overrides.status || 'pending';
    const expiresAt = overrides.expiresAt !== undefined ? overrides.expiresAt : new Date(Date.now() + 3600000);

    const res = await pool.query(
      `INSERT INTO bookings (
        booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
        price_per_day, subtotal, rental_total, deposit, grand_total, status,
        renter_name, renter_phone, renter_email, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 2, 100000, 200000, 200000, 200000, 400000, $6, $7, '08123456789', $8, $9, NOW(), NOW())
      RETURNING id, booking_code, status, grand_total`,
      [
        code,
        customerUser.id,
        testMotorId,
        start,
        end,
        status,
        customerUser.name,
        customerUser.email,
        expiresAt,
      ]
    );

    const created = res.rows[0];
    createdBookingIds.push(created.id);
    return created;
  }

  describe('1. Konfirmasi Pembayaran Booking Milik Pelanggan oleh Admin & Staf', () => {
    it('admin berhasil mengonfirmasi pembayaran booking milik pelanggan menggunakan kode booking', async () => {
      const b = await createTestBooking();

      const res = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'transfer', notes: 'Transfer BCA lunas diverifikasi admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('confirmed');
      expect(res.body.data.paymentStatus).toBe('paid');

      // Verify in DB
      const dbRes = await pool.query('SELECT status, paid_at FROM bookings WHERE id = $1', [b.id]);
      expect(dbRes.rows[0].status).toBe('confirmed');
      expect(dbRes.rows[0].paid_at).not.toBeNull();
    });

    it('staf berhasil mengonfirmasi pembayaran booking milik pelanggan menggunakan ID numerik', async () => {
      const b = await createTestBooking();

      const res = await request(app)
        .post(`/api/admin/bookings/${b.id}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ paymentMethod: 'cash', notes: 'Bayar tunai di counter staf' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('confirmed');
      expect(res.body.data.paymentStatus).toBe('paid');
    });
  });

  describe('2. Pemetaan Error Akurat (404 vs 409)', () => {
    it('identifier yang salah (ID acak atau kode non-existent) menghasilkan 404 NOT_FOUND yang benar', async () => {
      const res1 = await request(app)
        .post('/api/admin/bookings/999999999/confirm-manual-payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'transfer' });

      expect(res1.status).toBe(404);
      expect(res1.body.success).toBe(false);
      expect(res1.body.error.code).toBe('BOOKING_NOT_FOUND');

      const res2 = await request(app)
        .post('/api/admin/bookings/KODE-TIDAK-NYATA/confirm-manual-payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'transfer' });

      expect(res2.status).toBe(404);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('booking yang telah kedaluwarsa menghasilkan 409 BOOKING_EXPIRED dengan pesan jelas', async () => {
      const expiredDate = new Date(Date.now() - 3600000); // 1 jam lalu
      const b = await createTestBooking({ expiresAt: expiredDate });

      const res = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'transfer' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BOOKING_EXPIRED');
      expect(res.body.error.message).toMatch(/kedaluwarsa/i);
    });

    it('status yang tidak sesuai (misal sudah confirmed) menghasilkan 409 INVALID_STATUS_TRANSITION jika status bukan pending', async () => {
      const b = await createTestBooking({ status: 'active' });

      const res = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'transfer' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('3. Idempotensi & Pencegahan Efek Ganda (Klik Ganda)', () => {
    it('dua permintaan konfirmasi pembayaran konkuren untuk booking pending yang sama menghasilkan efek idempoten dan sukses tanpa error', async () => {
      const b = await createTestBooking();

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/bookings/${b.booking_code}/confirm-manual-payment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ paymentMethod: 'transfer', notes: 'Double click test 1' }),
        request(app)
          .post(`/api/admin/bookings/${b.booking_code}/confirm-manual-payment`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ paymentMethod: 'transfer', notes: 'Double click test 2' }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify payment records count in DB is exactly 1
      const payRes = await pool.query('SELECT COUNT(*) FROM payments WHERE booking_id = $1', [b.id]);
      expect(Number(payRes.rows[0].count)).toBe(1);
    });
  });

  describe('4. Pengujian Alur Lengkap Sewa (Full Rental Lifecycle)', () => {
    it('menjalankan alur penuh: pending -> konfirmasi pembayaran -> confirmed -> serah terima -> active -> pengembalian -> completed -> tandai deposit dikembalikan', async () => {
      // Pastikan customer user memiliki dokumen KTP & SIM terverifikasi
      await pool.query(
        `INSERT INTO user_documents (user_id, type, stored_name, mime_type, size_bytes, status, verified_at, uploaded_at)
         VALUES ($1, 'ktp', 'test_ktp.jpg', 'image/jpeg', 1024, 'verified', NOW(), NOW()),
                ($1, 'sim', 'test_sim.jpg', 'image/jpeg', 1024, 'verified', NOW(), NOW())
         ON CONFLICT (user_id, type) DO UPDATE SET status = 'verified', verified_at = NOW()`,
        [customerUser.id]
      );

      const today = todayWIB();
      const b = await createTestBooking({
        startDate: today,
        endDate: format(addDays(parseISO(today), 2), 'yyyy-MM-dd'),
      });
      expect(b.status).toBe('pending');

      // 1. Konfirmasi Pembayaran Manual -> confirmed
      const confirmRes = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/confirm-manual-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'transfer', notes: 'Lunas via transfer BCA' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.status).toBe('confirmed');
      expect(confirmRes.body.data.paymentStatus).toBe('paid');

      // 2. Serah Terima Motor -> active
      const handoverRes = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          startOdometer: 15000,
          initialFuel: 'penuh',
          conditionNotes: 'Unit bersih, 2 helm SNI diserahkan',
          originalDocsChecked: true,
          depositReceived: true,
        });

      expect(handoverRes.status).toBe(200);
      const handoverBooking = handoverRes.body.data.booking || handoverRes.body.data;
      expect(handoverBooking.status).toBe('active');

      // 3. Pengembalian Motor -> completed
      const returnRes = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/return`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          returnTime: new Date().toISOString(),
          endOdometer: 15080,
          finalFuel: 'penuh',
          notes: 'Unit kembali mulus',
          damageFee: 0,
          otherFee: 0,
        });

      expect(returnRes.status).toBe(200);
      const returnBooking = returnRes.body.data.booking || returnRes.body.data;
      expect(returnBooking.status).toBe('completed');

      // 4. Tandai Deposit Dikembalikan
      const refundRes = await request(app)
        .post(`/api/admin/bookings/${b.booking_code}/deposit-refunded`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(refundRes.status).toBe(200);
      expect(refundRes.body.data.depositReturned).toBe(true);

      // Verifikasi akhir di basis data PostgreSQL
      const finalDb = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [b.id]
      );
      expect(finalDb.rows[0].status).toBe('completed');

      const returnDb = await pool.query(
        'SELECT deposit_refunded_at FROM booking_returns WHERE booking_id = $1',
        [b.id]
      );
      expect(returnDb.rows[0].deposit_refunded_at).not.toBeNull();
    });
  });
});
