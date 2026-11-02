const request = require('supertest');
const app = require('../../src/app');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');

describe('Security Test: Auth Hardening, JWT Integrity, Rate Limits, & Data Leak Protection', () => {
  let activeUser, deactivatedUser;
  let activeToken, deactivatedToken;

  beforeAll(async () => {
    await cleanDatabase();

    activeUser = await factory.createUser({ email: 'active_sec@rodakita.id', isActive: true });
    deactivatedUser = await factory.createUser({ email: 'deactivated_sec@rodakita.id', isActive: false });

    activeToken = jwt.sign({ id: activeUser.id, role: 'customer', email: activeUser.email }, env.JWT_SECRET);
    deactivatedToken = jwt.sign({ id: deactivatedUser.id, role: 'customer', email: deactivatedUser.email }, env.JWT_SECRET);

    await factory.createMotorcycle({ plateNumber: 'B 1234 SEC' });
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  describe('Integritas JWT (JSON Web Token)', () => {
    test('Token dengan tanda tangan (signature) palsu ditolak dengan 401 UNAUTHORIZED', async () => {
      const forgedToken = jwt.sign({ id: activeUser.id, role: 'admin' }, 'wrong_secret_key_123');

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('Token dengan algoritma none (alg: "none") ditolak dengan 401 UNAUTHORIZED', async () => {
      // Header: {"alg":"none","typ":"JWT"} -> eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0
      // Payload: {"id":1,"role":"admin"} -> eyJpZCI6MSwicm9sZSI6ImFkbWluIn0
      const algNoneToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6MSwicm9sZSI6ImFkbWluIn0.';

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${algNoneToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Token akun yang telah dinonaktifkan (is_active = false) ditolak', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${deactivatedToken}`);

      expect([401, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Pencegahan Kebocoran Data Sensitif (No Leaks)', () => {
    test('Respons publik katalog /api/motorcycles tidak pernah memuat plat nomor lengkap', async () => {
      const res = await request(app).get('/api/motorcycles');

      expect(res.status).toBe(200);
      const motors = res.body.data;
      expect(motors.length).toBeGreaterThan(0);

      motors.forEach((m) => {
        if (m.plateNumber) {
          expect(m.plateNumber).toContain('***');
        }
        if (m.plate) {
          expect(m.plate).toContain('***');
        }
      });
    });

    test('Endpoint /api/auth/me tidak pernah membocorkan password_hash, salt, atau token sensitif', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${activeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.password_hash).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.salt).toBeUndefined();
    });
  });

  describe('Keamanan Header HTTP (Helmet Protection)', () => {
    test('Header keamanan penting hadir pada seluruh respons', async () => {
      const res = await request(app).get('/api/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options'] || res.headers['content-security-policy']).toBeDefined();
    });
  });
});
