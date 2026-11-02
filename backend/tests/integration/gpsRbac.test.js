const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../db/pool');
const { gpsRepo, motorRepo, userRepo } = require('../../src/repositories');
const eventBroadcaster = require('../../src/services/realtime/eventBroadcaster');

describe('Integration Test: GPS RBAC Security & Privacy Isolation (Tahap 3)', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let testMotor;
  let testDevice;
  let testAlert;

  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    // 1. Dapatkan token Admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminLogin.body.data.token;

    // 2. Dapatkan token Customer
    const custLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerToken = custLogin.body.data.token;

    // 3. Dapatkan token Staff
    const staffLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@rodakita.id', password: 'Staff12345' });
    staffToken = staffLogin.body?.data?.token;

    // 4. Siapkan motor & perangkat tes
    const motorsRes = await motorRepo.findAll({}, { limit: 1 });
    const motors = motorsRes.items || motorsRes.data || (Array.isArray(motorsRes) ? motorsRes : []);
    testMotor = motors[0];

    // Buat perangkat tes jika belum ada
    const existingDev = await gpsRepo.findDeviceByMotorcycleId(testMotor.id);
    if (!existingDev) {
      testDevice = await gpsRepo.createDevice({
        motorcycleId: testMotor.id,
        provider: 'simulator',
        externalId: 'TEST-RBAC-DEV-001',
        label: `RBAC Device ${testMotor.name}`,
        isActive: true,
      });
    } else {
      testDevice = existingDev;
    }

    // Buat alert tes
    testAlert = await gpsRepo.createOrIncrementAlert({
      deviceId: testDevice.id,
      motorcycleId: testMotor.id,
      type: 'kecepatan',
      severity: 'warning',
      details: { speedKmh: 95 },
      dedupeKey: `rbac_test:${testDevice.id}`,
    });
  });

  afterAll(async () => {
    eventBroadcaster.destroy();
    if (testAlert) {
      await gpsRepo.resolveAlert(testAlert.id, 'Teardown');
    }
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  describe('1. Isolasi Akses Pelanggan (Customer Blockade)', () => {
    test('Pelanggan ditolak 403 pada GET /api/admin/gps/live', async () => {
      const res = await request(app)
        .get('/api/admin/gps/live')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Pelanggan ditolak 403 pada GET /api/admin/gps/motorcycles/:id/positions', async () => {
      const res = await request(app)
        .get(`/api/admin/gps/motorcycles/${testMotor.id}/positions`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Pelanggan ditolak 403 pada GET /api/admin/gps/alerts', async () => {
      const res = await request(app)
        .get('/api/admin/gps/alerts')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Pelanggan ditolak 403 pada GET /api/admin/gps/devices', async () => {
      const res = await request(app)
        .get('/api/admin/gps/devices')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Pelanggan ditolak 403 pada GET /api/admin/gps/geofences', async () => {
      const res = await request(app)
        .get('/api/admin/gps/geofences')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Pelanggan ditolak 403 pada GET /api/admin/gps/settings', async () => {
      const res = await request(app)
        .get('/api/admin/gps/settings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Pelanggan ditolak 403 pada GET /api/admin/gps/access-log', async () => {
      const res = await request(app)
        .get('/api/admin/gps/access-log')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Isolasi Realtime: canUserReceiveEvent menolak pengiriman event gps.* ke peran customer', () => {
      const customerUser = { id: 10, role: 'customer' };
      const staffUser = { id: 2, role: 'staff' };
      const adminUser = { id: 1, role: 'admin' };

      const gpsPosEvent = { type: 'gps.position', payload: { lat: -8.6, lng: 115.2 } };
      const gpsAlertEvent = { type: 'gps.alert', payload: { type: 'kecepatan' } };

      // Customer TIDAK PERNAH menerima event GPS
      expect(eventBroadcaster.canUserReceiveEvent(customerUser, gpsPosEvent)).toBe(false);
      expect(eventBroadcaster.canUserReceiveEvent(customerUser, gpsAlertEvent)).toBe(false);

      // Staff & Admin BOLEH menerima
      expect(eventBroadcaster.canUserReceiveEvent(staffUser, gpsPosEvent)).toBe(true);
      expect(eventBroadcaster.canUserReceiveEvent(adminUser, gpsPosEvent)).toBe(true);
    });
  });

  describe('2. Matriks Hak Akses Staf Operasional (Staff)', () => {
    test('Staff dapat mengakses GET /api/admin/gps/live', async () => {
      const res = await request(app)
        .get('/api/admin/gps/live')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.devices)).toBe(true);
    });

    test('Staff dapat mengakses riwayat rute dalam batas 7 hari', async () => {
      const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();

      const res = await request(app)
        .get(`/api/admin/gps/motorcycles/${testMotor.id}/positions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.positions)).toBe(true);
    });

    test('Staff DITOLAK 403 saat meminta riwayat melebihi batas 7 hari (ROLE_HISTORY_LIMIT_EXCEEDED)', async () => {
      const from = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 hari lalu (> 7 hari)
      const to = new Date().toISOString();

      const res = await request(app)
        .get(`/api/admin/gps/motorcycles/${testMotor.id}/positions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_HISTORY_LIMIT_EXCEEDED');
      expect(res.body.error.message).toContain('Staff dibatasi melihat riwayat maksimal 7 hari');
    });

    test('Staff dapat melihat daftar alert dan mengakui (acknowledge) alert', async () => {
      const listRes = await request(app)
        .get('/api/admin/gps/alerts?status=open')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(listRes.status).toBe(200);

      const ackRes = await request(app)
        .patch(`/api/admin/gps/alerts/${testAlert.id}/acknowledge`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ note: 'Sedang diperiksa oleh staf lapangan' });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe('acknowledged');
    });

    test('Staff DITOLAK 403 pada endpoint khusus Admin (devices, geofences, settings, access-log)', async () => {
      // Devices
      const devRes = await request(app)
        .get('/api/admin/gps/devices')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(devRes.status).toBe(403);

      // Geofences
      const geoRes = await request(app)
        .get('/api/admin/gps/geofences')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(geoRes.status).toBe(403);

      // Settings
      const setRes = await request(app)
        .get('/api/admin/gps/settings')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(setRes.status).toBe(403);

      // Access Log
      const logRes = await request(app)
        .get('/api/admin/gps/access-log')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(logRes.status).toBe(403);
    });
  });

  describe('3. Matriks Hak Akses Admin Penuh', () => {
    test('Admin dapat meminta riwayat lebih dari 7 hari (sampai masa retensi 90 hari)', async () => {
      const from = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 hari lalu
      const to = new Date().toISOString();

      const res = await request(app)
        .get(`/api/admin/gps/motorcycles/${testMotor.id}/positions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Admin dapat mengelola perangkat, geofence, dan pengaturan GPS', async () => {
      // Get devices
      const devRes = await request(app)
        .get('/api/admin/gps/devices')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(devRes.status).toBe(200);

      // Get geofences
      const geoRes = await request(app)
        .get('/api/admin/gps/geofences')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(geoRes.status).toBe(200);

      // Get settings
      const setRes = await request(app)
        .get('/api/admin/gps/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(setRes.status).toBe(200);
      expect(setRes.body.data['gps.speed_limit_kmh']).toBeDefined();

      // Update settings
      const putRes = await request(app)
        .put('/api/admin/gps/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ 'gps.speed_limit_kmh': 85 });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data['gps.speed_limit_kmh']).toBe(85);

      // Revert back
      await request(app)
        .put('/api/admin/gps/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ 'gps.speed_limit_kmh': 80 });
    });
  });

  describe('4. Pencatatan Audit Log Privasi (gps_access_log)', () => {
    test('Akses live tracking dan riwayat posisi mencatat audit log gps_access_log', async () => {
      // 1. Panggil /live oleh staff
      await request(app)
        .get('/api/admin/gps/live')
        .set('Authorization', `Bearer ${staffToken}`);

      // 2. Panggil /positions oleh staff
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();
      await request(app)
        .get(`/api/admin/gps/motorcycles/${testMotor.id}/positions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .set('Authorization', `Bearer ${staffToken}`);

      // 3. Verifikasi log oleh Admin
      const logRes = await request(app)
        .get('/api/admin/gps/access-log')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logRes.status).toBe(200);
      const logs = logRes.body.data || [];
      const hasLiveLog = logs.some((l) => l.action === 'lihat_live');
      const hasHistoryLog = logs.some((l) => l.action === 'lihat_riwayat' && l.motorcycleId === testMotor.id);

      expect(hasLiveLog).toBe(true);
      expect(hasHistoryLog).toBe(true);
    });
  });
});
