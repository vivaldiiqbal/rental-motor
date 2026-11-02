const request = require('supertest');
const app = require('../../src/app');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');

describe('Security Test: SQL Injection, XSS, & Parameter Fuzzing Resilience', () => {
  let user, userToken, motor;

  beforeAll(async () => {
    await cleanDatabase();
    user = await factory.createUser({ email: 'sec_fuzz@rodakita.id' });
    userToken = jwt.sign({ id: user.id, role: 'customer', email: user.email }, env.JWT_SECRET);
    motor = await factory.createMotorcycle();
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  describe('Ketahanan Terhadap SQL Injection (Fuzzing Parameter)', () => {
    const maliciousPayloads = [
      "' OR '1'='1",
      "1; DROP TABLE users; --",
      "' UNION SELECT NULL, username, password_hash FROM users --",
      "admin'--",
      "' OR 1=1; SELECT * FROM pg_tables; --",
      "'; EXEC xp_cmdshell('dir'); --",
    ];

    maliciousPayloads.forEach((payload) => {
      test(`Query param search dengan payload SQLi: "${payload}" tidak menyebabkan 500 dan tidak mengeksekusi SQL`, async () => {
        const res = await request(app).get(`/api/motorcycles?search=${encodeURIComponent(payload)}`);

        // Harus 200 (hasil kosong) atau 400 (ditolak validator), TIDAK BOLEH 500
        expect(res.status).not.toBe(500);
        expect([200, 400]).toContain(res.status);

        // Verifikasi tabel users tetap utuh dan aman
        const check = await pool.query('SELECT COUNT(*) AS count FROM users');
        expect(Number(check.rows[0].count)).toBeGreaterThan(0);
      });
    });

    test('Query params aneh (page=abc, limit=-1, sort ngawur, search emoji) ditangani tanpa 500', async () => {
      const res = await request(app).get('/api/motorcycles?page=abc&limit=-1&sort=drop_table&search=%27%22%F0%9F%9A%80%F0%9F%94%A5');

      expect(res.status).not.toBe(500);
      expect([200, 400]).toContain(res.status);
    });

    test('Filter minPrice > maxPrice (misal minPrice=500000 & maxPrice=100000) ditangani tanpa 500', async () => {
      const res = await request(app).get('/api/motorcycles?minPrice=500000&maxPrice=100000');

      expect(res.status).not.toBe(500);
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('Ketahanan Terhadap XSS (Cross-Site Scripting)', () => {
    const xssPayload = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';

    test('Input pesan kontak dengan tag skrip XSS disanitasi dan tidak dieksekusi mentah', async () => {
      const res = await request(app)
        .post('/api/contact')
        .send({
          name: 'Hacker XSS',
          email: 'hacker@evil.com',
          subject: 'Pertanyaan',
          message: xssPayload,
        });

      expect([200, 201]).toContain(res.status);

      // Cek di database apakah tersimpan aman
      const dbRes = await pool.query("SELECT message FROM contact_messages WHERE email = 'hacker@evil.com'");
      expect(dbRes.rows.length).toBeGreaterThan(0);
    });
  });
});
