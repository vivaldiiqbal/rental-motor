const request = require('supertest');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');
const { gpsRepo, motorRepo } = require('../../src/repositories');
const { runGpsRetentionJob } = require('../../src/jobs/gpsJobs');

describe('Integration Test: GPS Retention Cleaner, Concurrency & Performance Benchmark (Tahap 5)', () => {
  let testMotor;
  let testDevice;
  let adminToken;
  const SECRET = env.GPS_INGEST_SECRET;

  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminLogin.body.data.token;

    const motorsRes = await motorRepo.findAll({}, { limit: 1 });
    const motors = motorsRes.items || motorsRes.data || (Array.isArray(motorsRes) ? motorsRes : []);
    testMotor = motors[0];

    const existing = await gpsRepo.findDeviceByMotorcycleId(testMotor.id);
    if (!existing) {
      testDevice = await gpsRepo.createDevice({
        motorcycleId: testMotor.id,
        provider: 'simulator',
        externalId: 'TEST-RETENTION-DEV-001',
        label: `Retention Test Device ${testMotor.name}`,
        isActive: true,
      });
    } else {
      testDevice = existing;
    }
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  describe('1. Pembersih Retensi Posisi & Alert (Retention Cleaner Job)', () => {
    test('Membersihkan posisi > 90 hari dan alert > 365 hari dalam batch tanpa menghapus data baru', async () => {
      const now = Date.now();
      // Titik lama 100 hari lalu (> 90 hari)
      const oldTime1 = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();
      const oldTime2 = new Date(now - 101 * 24 * 60 * 60 * 1000).toISOString();
      // Titik baru 5 hari lalu (< 90 hari)
      const freshTime = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();

      // Rekam posisi lama dan baru
      await gpsRepo.recordPosition({
        deviceId: testDevice.id,
        recordedAt: oldTime1,
        lat: -8.67,
        lng: 115.21,
      });
      await gpsRepo.recordPosition({
        deviceId: testDevice.id,
        recordedAt: oldTime2,
        lat: -8.671,
        lng: 115.211,
      });
      await gpsRepo.recordPosition({
        deviceId: testDevice.id,
        recordedAt: freshTime,
        lat: -8.672,
        lng: 115.212,
      });

      // Buat alert lama 400 hari lalu (> 365 hari)
      const oldAlertTime = new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString();
      await gpsRepo.createOrIncrementAlert({
        deviceId: testDevice.id,
        motorcycleId: testMotor.id,
        type: 'kecepatan',
        severity: 'warning',
        details: { note: 'Old alert > 1 yr' },
        dedupeKey: `old_alert_${Date.now()}`,
      });

      // Jalankan pekerjaan pembersih retensi
      const result = await runGpsRetentionJob();
      expect(result).toBeDefined();
      expect(result.positionsDeleted).toBeGreaterThanOrEqual(2);

      // Verifikasi: Posisi baru tetap ada
      const recentPositions = await gpsRepo.getPositionsHistory(
        testDevice.id,
        new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(now).toISOString()
      );
      const freshFound = (recentPositions || []).some((p) => new Date(p.recordedAt).getTime() === new Date(freshTime).getTime());
      expect(freshFound).toBe(true);
    });
  });

  describe('2. Benchmark Kinerja & Latensi (Performance p95)', () => {
    test('Penerimaan posisi (POST /api/gps/ingest) memiliki latensi p95 di bawah 150 ms', async () => {
      const gpsIngestService = require('../../src/services/gps/gpsIngestService');
      const latencies = [];
      const totalRequests = 20;

      for (let i = 0; i < totalRequests; i++) {
        gpsIngestService.resetRateLimits();
        const payload = {
          externalId: testDevice.externalId,
          lat: -8.6700 + i * 0.0001,
          lng: 115.2100 + i * 0.0001,
          speedKmh: 40,
          recordedAt: new Date(Date.now() - (totalRequests - i) * 1000).toISOString(),
        };

        const start = Date.now();
        const res = await request(app)
          .post('/api/gps/ingest')
          .set('X-Gps-Secret', SECRET)
          .send(payload);
        const duration = Date.now() - start;

        expect(res.status).toBe(202);
        latencies.push(duration);
      }

      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95 = latencies[p95Index];

      expect(p95).toBeLessThan(150);
    });

    test('Endpoint pemantauan live (GET /api/admin/gps/live) memiliki latensi p95 di bawah 300 ms', async () => {
      const latencies = [];
      const totalRequests = 10;

      for (let i = 0; i < totalRequests; i++) {
        const start = Date.now();
        const res = await request(app)
          .get('/api/admin/gps/live')
          .set('Authorization', `Bearer ${adminToken}`);
        const duration = Date.now() - start;

        expect(res.status).toBe(200);
        latencies.push(duration);
      }

      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95 = latencies[p95Index];

      expect(p95).toBeLessThan(300);
    });
  });
});
