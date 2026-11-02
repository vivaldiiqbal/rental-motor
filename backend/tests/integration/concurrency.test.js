const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');
const { addDays, format } = require('date-fns');
const expireBookingsJob = require('../../src/jobs/expireBookings');

describe('Integration Test: High Concurrency, Double Booking & Advisory Locks', () => {
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
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  describe('1. Concurrency: Double Booking Prevention (Race Condition on Same Slot)', () => {
    test('Dua pemesanan serentak pada slot tanggal yang beririsan: tepat satu berhasil (201), yang lain 409', async () => {
      const today = new Date();
      const start1 = format(addDays(today, 40), 'yyyy-MM-dd');
      const end1 = format(addDays(today, 44), 'yyyy-MM-dd');
      const start2 = format(addDays(today, 42), 'yyyy-MM-dd');
      const end2 = format(addDays(today, 46), 'yyyy-MM-dd');

      const payload1 = {
        motorId: 7,
        startDate: start1,
        endDate: end1,
        pickupTime: '09:00',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: {
          name: 'Ilham Ramadhan',
          phone: '081234567890',
          email: 'demo@rodakita.id',
        },
      };

      const payload2 = {
        motorId: 7,
        startDate: start2,
        endDate: end2,
        pickupTime: '10:00',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: {
          name: 'Budi Santoso',
          phone: '081987654321',
          email: 'budi@gmail.com',
        },
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${authTokenDemo}`)
          .send(payload1),
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${authTokenBudi}`)
          .send(payload2),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const successRes = res1.status === 201 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      expect(successRes.body.success).toBe(true);
      expect(conflictRes.body.success).toBe(false);
      const errCode = conflictRes.body.error ? conflictRes.body.error.code : conflictRes.body.code;
      expect(errCode).toBe('BOOKING_CONFLICT');

      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          const countRes = await client.query(`
            SELECT COUNT(*)::int AS cnt
            FROM bookings
            WHERE motorcycle_id = 7
              AND status IN ('pending', 'confirmed', 'active')
              AND daterange(start_date, end_date, '[)') && daterange($1::date, $2::date, '[)')
          `, [start1, end2]);
          expect(countRes.rows[0].cnt).toBe(1);
        } finally {
          client.release();
        }
      }
    });

    test('Burst 20 permintaan booking paralel pada motor dan tanggal sama -> tepat satu sukses (201), 19 sisanya 409', async () => {
      const today = new Date();
      const burstStart = format(addDays(today, 50), 'yyyy-MM-dd');
      const burstEnd = format(addDays(today, 53), 'yyyy-MM-dd');

      const promises = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${authTokenDemo}`)
          .send({
            motorId: 8,
            startDate: burstStart,
            endDate: burstEnd,
            pickupTime: '09:00',
            pickup: 'store',
            payment: 'bank_transfer',
            renter: {
              name: `Pemesan Paralel #${i + 1}`,
              phone: '081234567890',
              email: `user${i + 1}@rodakita.id`,
            },
          }),
      );

      const responses = await Promise.all(promises);
      const statusCounts = responses.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});

      expect(statusCounts[201]).toBe(1);
      expect(statusCounts[409]).toBe(19);

      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          const countRes = await client.query(`
            SELECT COUNT(*)::int AS cnt
            FROM bookings
            WHERE motorcycle_id = 8
              AND status IN ('pending', 'confirmed', 'active')
              AND daterange(start_date, end_date, '[)') && daterange($1::date, $2::date, '[)')
          `, [burstStart, burstEnd]);
          expect(countRes.rows[0].cnt).toBe(1);
        } finally {
          client.release();
        }
      }
    }, 30000);

    test('20 permintaan paralel pada tanggal berbeda tidak saling menghalangi (semua 201)', async () => {
      const today = new Date();

      // 20 slot berbeda yang saling terpisah untuk motor-motor yang berstatus active
      const activeMotors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14];
      const promises = Array.from({ length: 20 }, (_, i) => {
        const motorId = activeMotors[i % activeMotors.length];
        const startDay = 70 + Math.floor(i / activeMotors.length) * 8;
        const start = format(addDays(today, startDay), 'yyyy-MM-dd');
        const end = format(addDays(today, startDay + 2), 'yyyy-MM-dd');

        return request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${authTokenDemo}`)
          .send({
            motorId,
            startDate: start,
            endDate: end,
            pickupTime: '09:00',
            pickup: 'store',
            payment: 'bank_transfer',
            renter: {
              name: `Pemesan Unik #${i + 1}`,
              phone: '081234567890',
              email: `unique${i + 1}@rodakita.id`,
            },
          });
      });

      const responses = await Promise.all(promises);
      const allSuccess = responses.every((r) => r.status === 201);
      expect(allSuccess).toBe(true);
    });

    test('Tanggal kembali = tanggal ambil booking lain tetap diizinkan ([start, end) semantics)', async () => {
      const today = new Date();
      const d1Start = format(addDays(today, 100), 'yyyy-MM-dd');
      const d1End = format(addDays(today, 103), 'yyyy-MM-dd'); // Kembali 103
      const d2Start = d1End; // Ambil 103
      const d2End = format(addDays(today, 106), 'yyyy-MM-dd');

      // Booking 1
      const res1 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 9,
          startDate: d1Start,
          endDate: d1End,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Customer A', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      expect(res1.status).toBe(201);

      // Booking 2: Mulai persis pada tanggal kembali booking 1
      const res2 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenBudi}`)
        .send({
          motorId: 9,
          startDate: d2Start,
          endDate: d2End,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Customer B', phone: '081987654321', email: 'budi@gmail.com' },
        });

      expect(res2.status).toBe(201);
    });
  });

  describe('2. Concurrency: Double Payment & Webhook Idempotency', () => {
    test('Dua webhook notifikasi pembayaran serentak untuk booking yang sama: keduanya aman (200) tanpa duplikasi event', async () => {
      const webhookPayload = {
        bookingCode: 'RK-50724',
        status: 'settlement',
        eventId: 'evt-concurrent-test-101',
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/payments/notification')
          .set('X-Callback-Signature', env.WEBHOOK_SECRET)
          .send(webhookPayload),
        request(app)
          .post('/api/payments/notification')
          .set('X-Callback-Signature', env.WEBHOOK_SECRET)
          .send(webhookPayload),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const bookingRes = await request(app)
        .get('/api/bookings/5')
        .set('Authorization', `Bearer ${authTokenDemo}`);

      expect(bookingRes.body.data.status).toBe('confirmed');

      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          const eventRes = await client.query(`
            SELECT COUNT(*)::int AS cnt
            FROM payment_events
            WHERE event_id = 'evt-concurrent-test-101'
          `);
          expect(eventRes.rows[0].cnt).toBe(1);
        } finally {
          client.release();
        }
      }
    });

    test('Dua panggilan simulasi pembayaran serentak pada booking pending: tepat 1 mengubah status dan tidak ada korupsi data', async () => {
      const today = new Date();
      const start = format(addDays(today, 60), 'yyyy-MM-dd');
      const end = format(addDays(today, 63), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 4,
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
        });

      expect(createRes.status).toBe(201);
      const newBookingId = createRes.body.data.id;

      const [pay1, pay2] = await Promise.all([
        request(app)
          .post(`/api/payments/${newBookingId}/simulate-pay`)
          .set('Authorization', `Bearer ${authTokenDemo}`),
        request(app)
          .post(`/api/payments/${newBookingId}/simulate-pay`)
          .set('Authorization', `Bearer ${authTokenDemo}`),
      ]);

      const validStatuses = [200, 400];
      expect(validStatuses).toContain(pay1.status);
      expect(validStatuses).toContain(pay2.status);
      expect(pay1.status === 200 || pay2.status === 200).toBe(true);

      const checkRes = await request(app)
        .get(`/api/bookings/${newBookingId}`)
        .set('Authorization', `Bearer ${authTokenDemo}`);

      expect(checkRes.body.data.status).toBe('confirmed');
    });

    test('Pembatalan dan pembayaran bersamaan pada booking yang sama berakhir pada keadaan konsisten (tanpa deadlock)', async () => {
      const today = new Date();
      const start = format(addDays(today, 120), 'yyyy-MM-dd');
      const end = format(addDays(today, 123), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 3,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Tester Race', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      expect(createRes.status).toBe(201);
      const targetId = createRes.body.data.id;

      // Jalankan batal dan bayar secara simultan
      const [cancelRes, payRes] = await Promise.all([
        request(app)
          .put(`/api/bookings/${targetId}/cancel`)
          .set('Authorization', `Bearer ${authTokenDemo}`)
          .send({ reason: 'Dibatalkan oleh pelanggan' }),
        request(app)
          .post(`/api/payments/${targetId}/simulate-pay`)
          .set('Authorization', `Bearer ${authTokenDemo}`),
      ]);

      // Keduanya tidak boleh 500
      expect(cancelRes.status).not.toBe(500);
      expect(payRes.status).not.toBe(500);

      const checkRes = await request(app)
        .get(`/api/bookings/${targetId}`)
        .set('Authorization', `Bearer ${authTokenDemo}`);

      // Status akhir harus salah satu dari: confirmed atau cancelled (tidak korup)
      expect(['confirmed', 'cancelled']).toContain(checkRes.body.data.status);
    });

    test('Kode promo dengan usage_limit 1 dan 10 booking paralel -> hanya satu yang berhasil memakainya', async () => {
      const today = new Date();
      const testCode = `PROMO1LIMIT_${Date.now()}`;

      // Buat promo dengan kuota 1
      if (process.env.USE_DB === 'postgres') {
        const client = await pool.connect();
        try {
          await client.query(`
            INSERT INTO promo_codes (
              code, type, value, max_discount, min_days, weekend_only,
              valid_from, valid_until, usage_limit, used_count, is_active
            ) VALUES (
              $1, 'fixed', 20000, 20000, 1, false,
              CURRENT_DATE, CURRENT_DATE + 30, 1, 0, true
            )
          `, [testCode]);
        } finally {
          client.release();
        }
      } else {
        const promos = store.getCollection('promos');
        promos.push({
          id: 9999,
          code: testCode,
          type: 'fixed',
          value: 20000,
          maxDiscount: 20000,
          minDays: 1,
          validUntil: '2028-12-31',
          quota: 1,
          usedCount: 0,
          isActive: true,
        });
      }

      // 10 booking paralel untuk motor berbeda-beda memakai promo yang sama
      const promises = Array.from({ length: 10 }, (_, i) => {
        const motorId = (i % 10) + 1;
        const start = format(addDays(today, 130 + i * 3), 'yyyy-MM-dd');
        const end = format(addDays(today, 132 + i * 3), 'yyyy-MM-dd');

        return request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${authTokenDemo}`)
          .send({
            motorId,
            startDate: start,
            endDate: end,
            pickupTime: '09:00',
            pickup: 'store',
            payment: 'bank_transfer',
            promoCode: testCode,
            renter: { name: `Tester Promo ${i + 1}`, phone: '081234567890', email: 'demo@rodakita.id' },
          });
      });

      const responses = await Promise.all(promises);

      // Hitung booking yang berhasil mendapatkan diskon promo
      let promoAppliedCount = 0;
      for (const res of responses) {
        if (res.status === 201 && res.body.data?.promoDiscount > 0) {
          promoAppliedCount++;
        }
      }

      expect(promoAppliedCount).toBe(1);
    });

    test('Pembayaran terlambat pada booking expired: slot bebas -> confirmed; slot terisi -> needs_refund', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      const client = await pool.connect();
      try {
        // Skenario A: Slot Bebas
        // Masukkan booking expired dengan slot bebas di masa depan
        const resA = await client.query(`
          INSERT INTO bookings (
            booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, renter_name, renter_phone, renter_email, status,
            price_per_day, subtotal, duration_discount, promo_discount, addons_total,
            delivery_total, rental_total, deposit, grand_total, expires_at
          ) VALUES (
            'RK-EXP-FREE', 1, 1, '2027-08-01', '2027-08-04', 3,
            '09:00', 'Tester', '081234567890', 'demo@rodakita.id', 'expired',
            75000, 225000, 0, 0, 0, 0, 225000, 200000, 425000, now() - interval '1 hour'
          ) RETURNING id
        `);
        const idA = resA.rows[0].id;

        const payA = await request(app)
          .post(`/api/payments/${idA}/simulate-pay`)
          .set('Authorization', `Bearer ${authTokenDemo}`);

        expect(payA.status).toBe(200);
        // Karena slot bebas, booking diaktifkan kembali menjadi confirmed
        const checkA = await client.query('SELECT status FROM bookings WHERE id = $1', [idA]);
        expect(checkA.rows[0].status).toBe('confirmed');

        // Skenario B: Slot Sudah Terisi
        // Masukkan booking expired
        const resB = await client.query(`
          INSERT INTO bookings (
            booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, renter_name, renter_phone, renter_email, status,
            price_per_day, subtotal, duration_discount, promo_discount, addons_total,
            delivery_total, rental_total, deposit, grand_total, expires_at
          ) VALUES (
            'RK-EXP-TAKEN', 1, 2, '2027-09-01', '2027-09-05', 4,
            '09:00', 'Tester', '081234567890', 'demo@rodakita.id', 'expired',
            85000, 340000, 0, 0, 0, 0, 340000, 200000, 540000, now() - interval '1 hour'
          ) RETURNING id
        `);
        const idB = resB.rows[0].id;

        // Orang lain telah memesan slot yang sama dan confirmed
        await client.query(`
          INSERT INTO bookings (
            booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, renter_name, renter_phone, renter_email, status,
            price_per_day, subtotal, duration_discount, promo_discount, addons_total,
            delivery_total, rental_total, deposit, grand_total
          ) VALUES (
            'RK-ACTIVE-TAKEN', 2, 2, '2027-09-01', '2027-09-05', 4,
            '09:00', 'Other', '081234567899', 'other@rodakita.id', 'confirmed',
            85000, 340000, 0, 0, 0, 0, 340000, 200000, 540000
          )
        `);

        // Pembayaran terlambat pada booking idB
        const payB = await request(app)
          .post(`/api/payments/${idB}/simulate-pay`)
          .set('Authorization', `Bearer ${authTokenDemo}`);

        // Booking harus tetap expired, payment berstatus needs_refund
        const checkB = await client.query('SELECT status FROM bookings WHERE id = $1', [idB]);
        expect(checkB.rows[0].status).toBe('expired');

        const payCheckB = await client.query('SELECT status FROM payments WHERE booking_id = $1', [idB]);
        expect(payCheckB.rows[0].status).toBe('needs_refund');
      } finally {
        client.release();
      }
    });
  });

  describe('3. Concurrency: Advisory Lock Protection on Cron Job', () => {
    test('Advisory Lock: Instance cron lain melewati eksekusi jika lock sedang dipegang oleh proses lain', async () => {
      if (process.env.USE_DB !== 'postgres') {
        await expireBookingsJob();
        return;
      }

      const client = await pool.connect();
      const EXPIRE_ADVISORY_LOCK_ID = 88776655;

      try {
        const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [EXPIRE_ADVISORY_LOCK_ID]);
        expect(lockRes.rows[0].locked).toBe(true);

        await expect(expireBookingsJob()).resolves.not.toThrow();

        const unlockRes = await client.query('SELECT pg_advisory_unlock($1) AS unlocked', [EXPIRE_ADVISORY_LOCK_ID]);
        expect(unlockRes.rows[0].unlocked).toBe(true);

        await expect(expireBookingsJob()).resolves.not.toThrow();
      } finally {
        client.release();
      }
    });

    test('Tiga pemanggilan expireBookingsJob() bersamaan berjalan aman tanpa crash', async () => {
      await expect(
        Promise.all([expireBookingsJob(), expireBookingsJob(), expireBookingsJob()]),
      ).resolves.not.toThrow();
    });

    test('Expire job dan simulate payment bersamaan pada booking yang sama berakhir konsisten', async () => {
      const today = new Date();
      const start = format(addDays(today, 150), 'yyyy-MM-dd');
      const end = format(addDays(today, 153), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 5,
          startDate: start,
          endDate: end,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Tester Expire Pay', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      const bId = createRes.body.data.id;

      // Jalankan expire cron dan pembayaran secara bersamaan
      await expect(
        Promise.all([
          expireBookingsJob(),
          request(app)
            .post(`/api/payments/${bId}/simulate-pay`)
            .set('Authorization', `Bearer ${authTokenDemo}`),
        ]),
      ).resolves.not.toThrow();

      const checkRes = await request(app)
        .get(`/api/bookings/${bId}`)
        .set('Authorization', `Bearer ${authTokenDemo}`);

      expect(['pending', 'confirmed', 'expired']).toContain(checkRes.body.data.status);
    });
  });
});
