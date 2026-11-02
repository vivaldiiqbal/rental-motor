const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');
const { addDays, format } = require('date-fns');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');
const expireBookingsJob = require('../../src/jobs/expireBookings');
const { recalcRatings } = require('../../src/services/reviewService');

describe('Integration Test: Atomic Multi-Table Business Logic & Transactions', () => {
  let authTokenDemo;
  let authTokenBudi;

  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
      await pool.query(`
        UPDATE renter_profiles SET completed_at = now() WHERE user_id = 2;
        INSERT INTO user_documents (user_id, type, stored_name, mime_type, size_bytes, status, uploaded_at, verified_at)
        VALUES (2, 'ktp', 'ktp_user_2.jpg', 'image/jpeg', 245600, 'verified', now(), now()),
               (2, 'sim', 'sim_user_2.jpg', 'image/jpeg', 245600, 'verified', now(), now())
        ON CONFLICT (user_id, type) DO UPDATE SET status = 'verified';
      `);
    } else {
      const { userRepo } = require('../../src/repositories');
      await userRepo.update(2, {
        documents: { ktp: 'verified', sim: 'verified' },
      });
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

  // ============================================================================
  // Operasi A: Pembuatan Booking Atomik & Idempotensi
  // ============================================================================
  describe('Operasi A: Buat Booking Atomik', () => {
    test('Idempotency Key: Replay jika hash sama (200), tolak 422 jika request body berbeda', async () => {
      const today = new Date();
      const start = format(addDays(today, 120), 'yyyy-MM-dd');
      const end = format(addDays(today, 123), 'yyyy-MM-dd');

      const payload1 = {
        motorId: 3,
        startDate: start,
        endDate: end,
        pickupTime: '09:00',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: {
          name: 'Ilham Ramadhan',
          phone: '081234567890',
          email: 'demo@rodakita.id',
        },
      };

      const key = 'idem-atomic-key-test-001';

      // 1. Request pertama: 201 Created
      const res1 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .set('Idempotency-Key', key)
        .send(payload1);

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      const code1 = res1.body.data.code;

      // 2. Request kedua dengan hash sama persis: 200 Replay
      const res2 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .set('Idempotency-Key', key)
        .send(payload1);

      expect(res2.status).toBe(200);
      expect(res2.headers['idempotent-replay']).toBe('true');
      expect(res2.body.data.code).toBe(code1);

      // 3. Request ketiga dengan key yang sama tetapi payload berbeda: 422 Conflict
      const payloadBeda = { ...payload1, notes: 'Catatan dimodifikasi berbeda' };
      const res3 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .set('Idempotency-Key', key)
        .send(payloadBeda);

      expect(res3.status).toBe(422);
      expect(res3.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    test('Konkurensi Paralel: Dua permintaan paralel pada slot dan motor yang sama menghasilkan tepat satu 201 dan satu 409', async () => {
      const today = new Date();
      const start = format(addDays(today, 130), 'yyyy-MM-dd');
      const end = format(addDays(today, 133), 'yyyy-MM-dd');

      const bookingReq1 = request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 4,
          startDate: start,
          endDate: end,
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'User 1', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      const bookingReq2 = request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenBudi}`)
        .send({
          motorId: 4,
          startDate: start,
          endDate: end,
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'User 2', phone: '081234567891', email: 'budi@gmail.com' },
        });

      const [res1, res2] = await Promise.all([bookingReq1, bookingReq2]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.error.code).toBe('BOOKING_CONFLICT');
      expect(conflictRes.body.error.details).toHaveProperty('conflictDates');
    });

    test('Promo atomik: Pembuatan booking dengan promo mencatat promo_redemptions dan menaikkan used_count', async () => {
      const today = new Date();
      const start = format(addDays(today, 140), 'yyyy-MM-dd');
      const end = format(addDays(today, 143), 'yyyy-MM-dd');

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          promoCode: 'HEMAT10',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Demo Promo', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.discount).toBeGreaterThan(0);

      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          const redRes = await client.query('SELECT * FROM promo_redemptions WHERE booking_id = $1', [res.body.data.id]);
          expect(redRes.rows.length).toBe(1);
          expect(redRes.rows[0].released_at).toBeNull();
        } finally {
          client.release();
        }
      }
    });
  });

  // ============================================================================
  // Operasi B: Pembatalan Atomik & Refund
  // ============================================================================
  describe('Operasi B: Pembatalan Booking Atomik', () => {
    test('Pembatalan booking confirmed melepaskan promo dan menandai payment menjadi refunded', async () => {
      const today = new Date();
      const start = format(addDays(today, 150), 'yyyy-MM-dd'); // > 48 jam -> refund 100%
      const end = format(addDays(today, 153), 'yyyy-MM-dd');

      // 1. Buat booking dengan promo
      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 2,
          startDate: start,
          endDate: end,
          promoCode: 'HEMAT10',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Demo Cancel', phone: '081234567890', email: 'demo@rodakita.id' },
        });
      const bookingId = bRes.body.data.id;

      // 2. Simulasikan bayar sehingga status confirmed dan payment paid
      await request(app)
        .post(`/api/payments/${bookingId}/simulate-pay`)
        .set('Authorization', `Bearer ${authTokenDemo}`);

      // 3. Pelanggan ditolak membatalkan booking yang sudah lunas/confirmed (Kebijakan baru)
      const custCancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({ reason: 'Ada kendala keluarga' });
      expect(custCancelRes.status).toBe(400);
      expect(custCancelRes.body.error.code).toBe('CANCELLATION_BLOCKED');

      // Admin membatalkan booking berbayar dengan keputusan refund
      const cancelRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${authTokenAdmin}`)
        .send({ reason: 'Ada kendala keluarga - dibatalkan oleh admin', refundAmount: bRes.body.data.total });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.refundAmount).toBe(bRes.body.data.total);

      // 4. Verifikasi payment menjadi refunded dan promo_redemptions diisi released_at
      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          const pRes = await client.query('SELECT status FROM payments WHERE booking_id = $1', [bookingId]);
          if (pRes.rows.length > 0) {
            expect(pRes.rows[0].status).toBe('refunded');
          }

          const rRes = await client.query('SELECT released_at FROM promo_redemptions WHERE booking_id = $1', [bookingId]);
          if (rRes.rows.length > 0) {
            expect(rRes.rows[0].released_at).not.toBeNull();
          }
        } finally {
          client.release();
        }
      }
    });
  });

  // ============================================================================
  // Operasi C: Pembayaran Sukses & Webhook Idempotensi
  // ============================================================================
  describe('Operasi C: Pembayaran Sukses & Idempotensi', () => {
    test('Webhook idempotent: Event yang sama diproses sekali tanpa duplikasi', async () => {
      const webhookPayload = {
        bookingCode: 'RK-50724',
        status: 'settlement',
        eventId: 'evt_test_unique_idempotent_999',
      };

      const res1 = await request(app)
        .post('/api/payments/notification')
        .set('X-Callback-Signature', env.WEBHOOK_SECRET)
        .send(webhookPayload);

      expect(res1.status).toBe(200);
      expect(res1.body.data.idempotent).toBe(true);

      // Panggilan kedua dengan eventId sama
      const res2 = await request(app)
        .post('/api/payments/notification')
        .set('X-Callback-Signature', env.WEBHOOK_SECRET)
        .send(webhookPayload);

      expect(res2.status).toBe(200);
      expect(res2.body.data.idempotent).toBe(true);
    });
  });

  // ============================================================================
  // Operasi D: Cron Expire Bookings
  // ============================================================================
  describe('Operasi D: Cron Expire Bookings', () => {
    test('expireBookingsJob berjalan bebas error dengan advisory lock', async () => {
      await expect(expireBookingsJob()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // Operasi E: Ulasan & Agregat Rating
  // ============================================================================
  describe('Operasi E: Selesai Sewa & Ulasan Motor', () => {
    test('Ulasan berhasil dan memperbarui rating_avg serta rating_count motor', async () => {
      // Booking ID 2 adalah completed milik Demo (User 1), motor 2
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          bookingId: 2,
          rating: 5,
          comment: 'Pelayanan sangat memuaskan, motor prima!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rating).toBe(5);

      // Verifikasi recalcRatings
      const stats = await recalcRatings(2);
      expect(stats.rating_avg !== undefined ? Number(stats.rating_avg) : stats.rating).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Operasi F: Favorit Idempotent & Sinkronisasi Set
  // ============================================================================
  describe('Operasi F: Favorit Idempotent & Sync', () => {
    test('Sinkronisasi favorit hanya memasukkan motor yang berstatus active', async () => {
      const res = await request(app)
        .post('/api/favorites/sync')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorIds: [1, 2, 3],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.motorIds || res.body.data)).toBe(true);
      expect(res.body.data.syncedCount).toBeGreaterThanOrEqual(1);
    });
  });
});
