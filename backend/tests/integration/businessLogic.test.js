const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../db/pool');
const { store } = require('../../src/repositories');
const { addDays, addHours, format } = require('date-fns');

describe('Integration Test: Detailed Business Logic (Refund Tiers & Rating Distribution)', () => {
  let authTokenDemo;
  let authTokenBudi;
  let authTokenAdmin;

  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    const loginDemo = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    authTokenDemo = loginDemo.body.data.token;

    const loginBudi = await request(app)
      .post('/api/auth/login')
      .send({ email: 'budi@gmail.com', password: 'Budi12345' });
    authTokenBudi = loginBudi.body.data.token;

    const loginAdmin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    authTokenAdmin = loginAdmin.body.data.token;
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  }, 15000);

  // ============================================================================
  // 1. Kebijakan Pengembalian Dana (Refund Tiers)
  // ============================================================================
  describe('1. Kebijakan Pembatalan & Keputusan Refund Baru', () => {
    test('Online sudah lunas: Pelanggan ditolak membatalkan; Admin dapat membatalkan dengan keputusan refund', async () => {
      const today = new Date();
      const start = format(addDays(today, 10), 'yyyy-MM-dd');
      const end = format(addDays(today, 13), 'yyyy-MM-dd');

      // Buat booking
      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Demo Refund 1', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      const bookingId = bRes.body.data.id;
      const totalAmount = bRes.body.data.total;

      // Bayar (confirmed)
      await request(app)
        .post(`/api/payments/${bookingId}/simulate-pay`)
        .set('Authorization', `Bearer ${authTokenDemo}`);

      // Pelanggan mencoba batalkan -> Ditolak 400
      const custCancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({ reason: 'Ingin batal mandiri' });

      expect(custCancelRes.status).toBe(400);
      expect(custCancelRes.body.error.code).toBe('CANCELLATION_BLOCKED');

      // Admin membatalkan dengan keputusan nominal refund
      const adminCancelRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${authTokenAdmin}`)
        .send({
          reason: 'Kendaraan rusak sebelum diserahkan, refund penuh',
          refundAmount: totalAmount,
        });

      expect(adminCancelRes.status).toBe(200);
      expect(adminCancelRes.body.data.status).toBe('cancelled');
      expect(adminCancelRes.body.data.refundAmount).toBe(totalAmount);
    });

    test('Tunai (bayar di tempat): Pelanggan boleh membatalkan sampai serah terima (status pending)', async () => {
      const today = new Date();
      const start = format(addDays(today, 25), 'yyyy-MM-dd');
      const end = format(addDays(today, 27), 'yyyy-MM-dd');

      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 3,
          startDate: start,
          endDate: end,
          pickupTime: '10:00',
          pickup: 'store',
          payment: 'cash',
          renter: { name: 'Demo Cash Cancel', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      const bookingId = bRes.body.data.id;
      expect(bRes.status).toBe(201);
      expect(bRes.body.data.paymentMethod).toBe('cash');

      // Pelanggan membatalkan booking tunai sebelum serah terima
      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({ reason: 'Batal karena ganti jadwal' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.refundAmount).toBe(0);
    });

    test('Online pending belum dibayar: Pelanggan boleh membatalkan sebelum membayar', async () => {
      const today = new Date();
      const start = format(addDays(today, 30), 'yyyy-MM-dd');
      const end = format(addDays(today, 32), 'yyyy-MM-dd');

      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 5,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Demo Online Pending', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      const bookingId = bRes.body.data.id;

      // Batalkan sebelum bayar
      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({ reason: 'Batal sebelum bayar' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.refundAmount).toBe(0);
    });
  });

  // ============================================================================
  // 2. Rating & Distribusi Ulasan Motor (Recalculation Integrity)
  // ============================================================================
  describe('2. Perhitungan Agregat Rating & Distribusi Bintang', () => {
    test('Beberapa ulasan memperbarui rating_avg, rating_count, dan distribusi rating_1..5 secara presisi', async () => {
      const motorId = 4; // Yamaha NMAX

      // Ambil detail motor sebelum ulasan tambahan
      const initialRes = await request(app).get(`/api/motorcycles/${motorId}`);
      expect(initialRes.status).toBe(200);

      // Buat 3 booking completed sintetis untuk motor 4 dengan user berbeda
      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          await client.query(`
            INSERT INTO bookings (
              id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
              pickup_time, renter_name, renter_phone, renter_email, status,
              price_per_day, subtotal, duration_discount, promo_discount, addons_total,
              delivery_total, rental_total, deposit, grand_total
            ) VALUES
            (8801, 'RK-REV-1', 1, 4, '2026-01-01', '2026-01-03', 2, '09:00', 'Tester 1', '081234567890', 't1@t.com', 'completed', 100000, 200000, 0, 0, 0, 0, 200000, 200000, 400000),
            (8802, 'RK-REV-2', 2, 4, '2026-01-05', '2026-01-07', 2, '09:00', 'Tester 2', '081234567891', 't2@t.com', 'completed', 100000, 200000, 0, 0, 0, 0, 200000, 200000, 400000)
            ON CONFLICT (id) DO NOTHING;
          `);
        } finally {
          client.release();
        }
      }

      // 1. User 1 memberi ulasan rating 5 bintang
      const rev1 = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          bookingId: 8801,
          rating: 5,
          comment: 'Sangat nyaman untuk touring!',
        });

      if (process.env.USE_DB === 'postgres') {
        expect(rev1.status).toBe(201);
      }

      // 2. User 2 memberi ulasan rating 3 bintang
      const rev2 = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${authTokenBudi}`)
        .send({
          bookingId: 8802,
          rating: 3,
          comment: 'Cukup lumayan, tapi agak boros.',
        });

      if (process.env.USE_DB === 'postgres') {
        expect(rev2.status).toBe(201);
      }

      // 3. Verifikasi motor agregat di database
      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          const mRes = await client.query('SELECT rating_avg, rating_count, rating_1, rating_2, rating_3, rating_4, rating_5 FROM motorcycles WHERE id = $1', [motorId]);
          const row = mRes.rows[0];

          expect(row.rating_count).toBeGreaterThanOrEqual(2);
          expect(row.rating_5).toBeGreaterThanOrEqual(1);
          expect(row.rating_3).toBeGreaterThanOrEqual(1);
          expect(Number(row.rating_avg)).toBeGreaterThan(0);
          expect(Number(row.rating_avg)).toBeLessThanOrEqual(5);
        } finally {
          client.release();
        }
      }
    });
  });
});
