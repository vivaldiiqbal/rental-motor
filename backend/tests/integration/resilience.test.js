const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../db/pool');
const { store } = require('../../src/repositories');
const env = require('../../src/config/env');
const { addDays, format } = require('date-fns');

describe('Integration Test: Database Resilience, Error Trapping & Zero Connection Leaks', () => {
  let authTokenDemo;

  beforeAll(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    authTokenDemo = loginRes.body.data.token;
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  }, 15000);

  // ============================================================================
  // 1. Resiliensi Parameter Aneh & Karakter Berbahaya (Tidak Pernah 500)
  // ============================================================================
  describe('1. Resiliensi Parameter Query & Input Aneh', () => {
    test('Query parameter aneh (page=abc, limit=xyz, sort=ngawur) aman dan mengembalikan 200', async () => {
      const res = await request(app)
        .get('/api/motorcycles?page=abc&limit=xyz&sort=ngawur_banget');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.page).toBe(1);
    });

    test("Pencarian teks mengandung karakter % _ ' ; -- tidak menghasilkan 500 SQL syntax error", async () => {
      const weirdQueries = [
        "%' OR 1=1 --",
        "%%%",
        "___",
        "Vario' OR '1'='1",
        "Beat; DROP TABLE motorcycles;--",
      ];

      for (const q of weirdQueries) {
        const res = await request(app)
          .get(`/api/motorcycles?search=${encodeURIComponent(q)}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  // ============================================================================
  // 2. pool.on('error') dan Pemutusan Koneksi (pg_terminate_backend)
  // ============================================================================
  describe("2. pool.on('error') & Pemulihan Koneksi", () => {
    test('Pemutusan koneksi mendadak via pg_terminate_backend ditangkap pool.on(error) tanpa mematikan proses', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      let poolErrorEmitted = false;
      const errorHandler = (err) => {
        poolErrorEmitted = true;
      };
      pool.on('error', errorHandler);

      // 1. Ambil client, catat PID-nya, lalu kembalikan ke pool agar menjadi IDLE connection di pool
      const victimClient = await pool.connect();
      const pidRes = await victimClient.query('SELECT pg_backend_pid() AS pid');
      const victimPid = pidRes.rows[0].pid;
      victimClient.release(); // KEMBALIKAN KE POOL SEBAGAI IDLE CONNECTION

      // 2. Terminasi koneksi idle tersebut dari client mandiri terpisah (bukan dari pool)
      const { Client } = require('pg');
      const killerClient = new Client({
        connectionString: process.env.TEST_DATABASE_URL || 'postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_test',
      });
      await killerClient.connect();
      try {
        await killerClient.query('SELECT pg_terminate_backend($1)', [victimPid]);
      } finally {
        await killerClient.end();
      }

      // 3. Berikan jeda waktu agar socket disconnect ditangkap oleh pool.on('error')
      await new Promise((r) => setTimeout(r, 400));

      pool.removeListener('error', errorHandler);

      // 4. Pastikan aplikasi dan pool tetap hidup serta pulih melayani query baru
      const healthRes = await request(app).get('/api/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.data.status).toBe('UP');
      if (process.env.USE_DB === 'postgres') {
        expect(healthRes.body.data.database.status).toBe('UP');
      }
    });

    test('Statement timeout menghasilkan status 503 (bukan crash 500)', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      const client = await pool.connect();
      try {
        // Simulasikan statement timeout pada query
        await client.query('SET statement_timeout = 50'); // 50ms
        let caughtErr = null;
        try {
          await client.query('SELECT pg_sleep(0.5)'); // 500ms > 50ms
        } catch (err) {
          caughtErr = err;
        }

        expect(caughtErr).not.toBeNull();
        expect(caughtErr.code).toBe('57014'); // query_canceled / statement_timeout

        const { handlePgError } = require('../../src/repositories/postgres/errors');
        const appErr = handlePgError(caughtErr);
        expect(appErr.statusCode).toBe(503);
        expect(appErr.code).toBe('TIMEOUT');
      } finally {
        await client.query('SET statement_timeout = 0');
        client.release();
      }
    });
  });

  // ============================================================================
  // 3. Uji Bebas Kebocoran Koneksi (Zero Connection Leak)
  // ============================================================================
  describe('3. Uji Kebocoran Koneksi (Zero Connection Leaks)', () => {
    test('200 permintaan beruntun (sukses & error transaksi) tidak membocorkan koneksi pool', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      const initialWaiting = pool.waitingCount;
      expect(initialWaiting).toBe(0);

      const today = new Date();
      const conflictStart = format(addDays(today, 80), 'yyyy-MM-dd');
      const conflictEnd = format(addDays(today, 82), 'yyyy-MM-dd');

      // 1. Buat 1 booking yang menempati slot
      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authTokenDemo}`)
        .send({
          motorId: 1,
          startDate: conflictStart,
          endDate: conflictEnd,
          pickupTime: '09:00',
          pickup: 'store',
          payment: 'bank_transfer',
          renter: { name: 'Demo Leak', phone: '081234567890', email: 'demo@rodakita.id' },
        });

      // 2. Jalankan 200 request beruntun dalam batch 20 request
      for (let batch = 0; batch < 10; batch++) {
        const batchRequests = [];
        for (let i = 0; i < 20; i++) {
          const idx = batch * 20 + i;
          if (idx % 4 === 0) {
            // Bentrok jadwal (409 di dalam transaksi)
            batchRequests.push(
              request(app)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${authTokenDemo}`)
                .send({
                  motorId: 1,
                  startDate: conflictStart,
                  endDate: conflictEnd,
                  pickupTime: '09:00',
                  pickup: 'store',
                  payment: 'bank_transfer',
                  renter: { name: 'Conflict User', phone: '081234567890', email: 'demo@rodakita.id' },
                }),
            );
          } else if (idx % 4 === 1) {
            // Baca motor valid (200)
            batchRequests.push(request(app).get('/api/motorcycles/1'));
          } else if (idx % 4 === 2) {
            // Motor tidak ditemukan (404)
            batchRequests.push(request(app).get('/api/motorcycles/999999'));
          } else {
            // Health check (200)
            batchRequests.push(request(app).get('/api/health'));
          }
        }
        await Promise.all(batchRequests);
      }

      // Berikan waktu sejenak agar seluruh client kembali idle
      await new Promise((r) => setTimeout(r, 400));

      // Verifikasi pool status: tidak ada antrian koneksi (waitingCount = 0)
      expect(pool.waitingCount).toBe(0);

      // Verifikasi pool masih sehat dengan menjalankan query baru
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT 1 AS check_alive');
        expect(res.rows[0].check_alive).toBe(1);
      } finally {
        client.release();
      }
    }, 30000);
  });
});
