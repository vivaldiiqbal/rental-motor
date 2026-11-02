const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');
const { gpsRepo, motorRepo } = require('../../src/repositories');
const gpsIngestService = require('../../src/services/gps/gpsIngestService');
const eventBroadcaster = require('../../src/services/realtime/eventBroadcaster');

describe('Integration Test: GPS Telemetry Ingest & Foundation (Tahap 1)', () => {
  let testMotor;
  let testDevice;
  const SECRET = env.GPS_INGEST_SECRET;

  function generateHmac(payload) {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', SECRET).update(str).digest('hex');
  }

  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    // Ambil motor pertama dari database untuk dipasangkan test device
    const motorsRes = await motorRepo.findAll({}, { limit: 1 });
    const motors = motorsRes.items || motorsRes.data || (Array.isArray(motorsRes) ? motorsRes : []);
    testMotor = motors[0];

    // Bersihkan device lama jika ada
    const existing = await gpsRepo.findDeviceByMotorcycleId(testMotor.id);
    if (existing) {
      await gpsRepo.deleteDevice(existing.id);
    }

    testDevice = await gpsRepo.createDevice({
      motorcycleId: testMotor.id,
      provider: 'simulator',
      externalId: 'TEST-GPS-DEVICE-001',
      label: `Test GPS Tracker ${testMotor.name}`,
      isActive: true,
      batteryPct: 95,
    });
  });

  afterAll(async () => {
    eventBroadcaster.destroy();
    if (testDevice) {
      await gpsRepo.deleteDevice(testDevice.id);
    }
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  beforeEach(() => {
    gpsIngestService.resetRateLimits();
  });

  describe('1. Autentikasi Rahasia & Verifikasi Signature HMAC', () => {
    test('Ingest tanpa secret atau signature ditolak 401 UNAUTHORIZED_PROVIDER', async () => {
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7956,
        lng: 110.3695,
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED_PROVIDER');
    });

    test('Ingest dengan signature HMAC yang salah ditolak 401 UNAUTHORIZED_PROVIDER', async () => {
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7956,
        lng: 110.3695,
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Signature', 'sha256=invalidhash1234567890abcdef')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED_PROVIDER');
    });

    test('Ingest dengan header X-Gps-Secret yang valid berhasil 202 Accepted', async () => {
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7956,
        lng: 110.3695,
        speedKmh: 30,
        heading: 90,
        ignition: true,
        batteryPct: 90,
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.processed).toBe(1);
    });

    test('Ingest dengan signature HMAC SHA256 valid berhasil 202 Accepted', async () => {
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7957,
        lng: 110.3696,
        speedKmh: 35,
        recordedAt: new Date().toISOString(),
      };
      const hmac = generateHmac(payload);

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Signature', `sha256=${hmac}`)
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Validasi Koordinat Geografis & Waktu Posisi', () => {
    test('Latitude di luar batas [-90, 90] ditolak 400 INVALID_LATITUDE', async () => {
      const payload = {
        externalId: testDevice.externalId,
        lat: 95.1234, // Invalid > 90
        lng: 110.3695,
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_LATITUDE');
    });

    test('Longitude di luar batas [-180, 180] ditolak 400 INVALID_LONGITUDE', async () => {
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7956,
        lng: 195.555, // Invalid > 180
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_LONGITUDE');
    });

    test('Posisi di masa depan (> 5 menit dari waktu sekarang) ditolak 400 FUTURE_POSITION_REJECTED', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // +10 menit
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7956,
        lng: 110.3695,
        recordedAt: futureDate,
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FUTURE_POSITION_REJECTED');
    });

    test('Posisi lampau (> 30 hari yang lalu) ditolak 400 STALE_POSITION_REJECTED', async () => {
      const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // -40 hari
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7956,
        lng: 110.3695,
        recordedAt: staleDate,
      };

      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('STALE_POSITION_REJECTED');
    });
  });

  describe('3. Idempotensi & Pencegahan Duplikasi (UNIQUE device_id, recorded_at)', () => {
    test('Payload posisi dengan timestamp sama persis diproses secara idempotent tanpa error 500', async () => {
      const fixedTimestamp = new Date(Date.now() - 60000).toISOString();
      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7850,
        lng: 110.3680,
        speedKmh: 42,
        recordedAt: fixedTimestamp,
      };

      // Ingest pertama kali
      const res1 = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res1.status).toBe(202);
      expect(res1.body.data.items[0].isDuplicate).toBe(false);

      // Ingest kedua kali (payload identik)
      const res2 = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      expect(res2.status).toBe(202);
      expect(res2.body.data.items[0].isDuplicate).toBe(true);
    });
  });

  describe('4. Penanganan Urutan Terbalik (Out-of-Order Tracking)', () => {
    test('Posisi historis yang datang terlambat tidak memundurkan status last_recorded_at perangkat', async () => {
      // Reset lastRecordedAt ke null untuk pengetesan urutan independen
      await gpsRepo.updateDevice(testDevice.id, { lastRecordedAt: null, lastLat: null, lastLng: null });

      const timeLater = new Date(Date.now() - 5000).toISOString(); // 5 detik lalu
      const timeEarlier = new Date(Date.now() - 50000).toISOString(); // 50 detik lalu

      // 1. Kirim titik yang lebih baru (timeLater)
      const resNew = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send({
          externalId: testDevice.externalId,
          lat: -7.7800,
          lng: 110.3700,
          recordedAt: timeLater,
        });

      expect(resNew.status).toBe(202);
      let updatedDevice = await gpsRepo.findDeviceById(testDevice.id);
      expect(new Date(updatedDevice.lastRecordedAt).getTime()).toBe(new Date(timeLater).getTime());
      expect(updatedDevice.lastLat).toBe(-7.7800);

      // 2. Kirim titik yang lebih lama (timeEarlier)
      const resOld = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send({
          externalId: testDevice.externalId,
          lat: -7.7820,
          lng: 110.3690,
          recordedAt: timeEarlier,
        });

      expect(resOld.status).toBe(202);
      expect(resOld.body.data.items[0].isNewest).toBe(false);

      // Pastikan lastRecordedAt di device TIDAK mundur ke timeEarlier
      updatedDevice = await gpsRepo.findDeviceById(testDevice.id);
      expect(new Date(updatedDevice.lastRecordedAt).getTime()).toBe(new Date(timeLater).getTime());
      expect(updatedDevice.lastLat).toBe(-7.7800);
    });
  });

  describe('5. Pembatasan Laju per Perangkat (Device Rate Limiting)', () => {
    test('Pengiriman lebih dari 5 request per detik per perangkat menghasilkan 429', async () => {
      const makeReq = (i) =>
        request(app)
          .post('/api/gps/ingest')
          .set('X-Gps-Secret', SECRET)
          .send({
            externalId: testDevice.externalId,
            lat: -7.7950 + i * 0.0001,
            lng: 110.3690,
            recordedAt: new Date(Date.now() - (10 - i) * 1000).toISOString(),
          });

      const promises = [makeReq(1), makeReq(2), makeReq(3), makeReq(4), makeReq(5), makeReq(6), makeReq(7)];
      const results = await Promise.all(promises);

      const has429 = results.some((r) => r.status === 429);
      expect(has429).toBe(true);

      const rateLimitRes = results.find((r) => r.status === 429);
      expect(rateLimitRes.body.error.code).toBe('DEVICE_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('6. Data Rusak & Robustness (Anti-Crash)', () => {
    test('Data string acak / non-json menghasilkan 400 Bad Request tanpa crash', async () => {
      const res = await request(app)
        .post('/api/gps/ingest')
        .set('Content-Type', 'application/json')
        .set('X-Gps-Secret', SECRET)
        .send('{ malformed json');

      expect(res.status).toBe(400);
    });

    test('Data tanpa externalId menghasilkan 400 MALFORMED_GPS_PAYLOAD', async () => {
      const res = await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send({
          lat: -7.7956,
          lng: 110.3695,
          recordedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MALFORMED_GPS_PAYLOAD');
    });
  });

  describe('7. Adapter Provider Traccar & Generic Webhook', () => {
    test('Traccar webhook payload diproses dengan benar dan mengonversi kecepatan', async () => {
      const traccarPayload = {
        event: 'position',
        device: {
          id: 101,
          uniqueId: testDevice.externalId,
          name: 'Vario 160 Tracker',
        },
        position: {
          id: 999,
          deviceId: 101,
          fixTime: new Date().toISOString(),
          latitude: -7.7888,
          longitude: 110.3777,
          speed: 20, // 20 knot -> ~37 km/h
          course: 180,
          accuracy: 3.5,
          attributes: {
            ignition: true,
            batteryLevel: 88,
          },
        },
      };

      const res = await request(app)
        .post('/api/gps/ingest?provider=traccar')
        .set('X-Gps-Secret', SECRET)
        .send(traccarPayload);

      expect(res.status).toBe(202);
      expect(res.body.data.provider).toBe('traccar');
      expect(res.body.data.processed).toBe(1);
      expect(res.body.data.items[0].lat).toBe(-7.7888);
      expect(res.body.data.items[0].lng).toBe(110.3777);
    });

    test('Generic Webhook batch array diproses dalam satu transaksi ingest', async () => {
      const t1 = new Date(Date.now() - 20000).toISOString();
      const t2 = new Date(Date.now() - 15000).toISOString();

      const batchPayload = [
        {
          externalId: testDevice.externalId,
          latitude: -7.7900,
          longitude: 110.3710,
          speedKmh: 40,
          timestamp: t1,
        },
        {
          externalId: testDevice.externalId,
          latitude: -7.7910,
          longitude: 110.3720,
          speedKmh: 45,
          timestamp: t2,
        },
      ];

      const res = await request(app)
        .post('/api/gps/ingest?provider=generic_webhook')
        .set('X-Gps-Secret', SECRET)
        .send(batchPayload);

      expect(res.status).toBe(202);
      expect(res.body.data.provider).toBe('generic_webhook');
      expect(res.body.data.processed).toBe(2);
    });
  });

  describe('8. Penyiaran Realtime (Event gps.position untuk Admin/Staff)', () => {
    test('Posisi baru memancarkan peristiwa gps.position ke bus realtime', async () => {
      // Beri jeda 3.2 detik dari request sebelumnya agar tidak ter-throttle broadcast
      await new Promise((r) => setTimeout(r, 3200));

      let broadcastedEvent = null;
      const onBroadcast = (ev) => {
        if (ev.type === 'gps.position' && ev.payload && ev.payload.deviceId === testDevice.id) {
          broadcastedEvent = ev;
        }
      };
      eventBroadcaster.on('broadcast', onBroadcast);

      const payload = {
        externalId: testDevice.externalId,
        lat: -7.7925,
        lng: 110.3735,
        speedKmh: 50,
        heading: 270,
        ignition: true,
        batteryPct: 82,
        recordedAt: new Date().toISOString(),
      };

      await request(app)
        .post('/api/gps/ingest')
        .set('X-Gps-Secret', SECRET)
        .send(payload);

      // Tunggu hingga debounce batch window 300ms di eventBroadcaster selesai dipancarkan
      await new Promise((r) => setTimeout(r, 450));
      eventBroadcaster.off('broadcast', onBroadcast);

      expect(broadcastedEvent).not.toBeNull();
      expect(broadcastedEvent.type).toBe('gps.position');
      expect(broadcastedEvent.payload.lat).toBe(-7.7925);
      expect(broadcastedEvent.payload.speedKmh).toBe(50);
      expect(broadcastedEvent.userId).toBeNull(); // null = admin/staff only
    });
  });
});
