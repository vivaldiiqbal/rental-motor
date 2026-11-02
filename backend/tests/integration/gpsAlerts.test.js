const { pool } = require('../../db/pool');
const { gpsRepo, motorRepo, bookingRepo, settingsRepo } = require('../../src/repositories');
const gpsAlertService = require('../../src/services/gps/gpsAlertService');
const eventBroadcaster = require('../../src/services/realtime/eventBroadcaster');

describe('Integration Test: Mesin Peringatan GPS (Tahap 2)', () => {
  let testMotor;
  let testDevice;
  let allowedGeofence;
  let forbiddenGeofence;
  let garageGeofence;

  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    const motorsRes = await motorRepo.findAll({}, { limit: 1 });
    const motors = motorsRes.items || motorsRes.data || (Array.isArray(motorsRes) ? motorsRes : []);
    testMotor = motors[0];

    // Bersihkan device & geofence sebelumnya
    const existingDev = await gpsRepo.findDeviceByMotorcycleId(testMotor.id);
    if (existingDev) {
      await gpsRepo.deleteDevice(existingDev.id);
    }

    testDevice = await gpsRepo.createDevice({
      motorcycleId: testMotor.id,
      provider: 'simulator',
      externalId: 'TEST-ALERT-DEV-001',
      label: `Alert Test Device ${testMotor.name}`,
      isActive: true,
      batteryPct: 100,
    });

    // Buat Geofence Markas (Garage) di Denpasar
    garageGeofence = await gpsRepo.createGeofence({
      name: 'Markas Pusat RodaKita',
      kind: 'garage',
      shape: 'circle',
      centerLat: -8.670458,
      centerLng: 115.212629,
      radiusM: 100,
      appliesToAll: true,
      isActive: true,
    });

    // Buat Geofence Diizinkan (Allowed Area) radius 5 km
    allowedGeofence = await gpsRepo.createGeofence({
      name: 'Zona Wisata Denpasar (Diizinkan)',
      kind: 'allowed',
      shape: 'circle',
      centerLat: -8.670458,
      centerLng: 115.212629,
      radiusM: 5000,
      appliesToAll: true,
      isActive: true,
    });

    // Buat Geofence Terlarang (Forbidden Area) di Kuta Timur radius 500m
    forbiddenGeofence = await gpsRepo.createGeofence({
      name: 'Zona Merah Pelabuhan (Terlarang)',
      kind: 'forbidden',
      shape: 'circle',
      centerLat: -8.7200,
      centerLng: 115.1800,
      radiusM: 500,
      appliesToAll: true,
      isActive: true,
    });
  });

  afterAll(async () => {
    eventBroadcaster.destroy();
    if (testDevice) {
      await gpsRepo.deleteDevice(testDevice.id);
    }
    if (garageGeofence) await gpsRepo.deleteGeofence(garageGeofence.id);
    if (allowedGeofence) await gpsRepo.deleteGeofence(allowedGeofence.id);
    if (forbiddenGeofence) await gpsRepo.deleteGeofence(forbiddenGeofence.id);

    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Selesaikan semua alert terbuka untuk test device
    const openAlerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open' });
    const alerts = openAlerts.data || openAlerts;
    for (const a of alerts) {
      await gpsRepo.resolveAlert(a.id, 'Reset test');
    }
  });

  test('1. Peringatan Kecepatan (kecepatan): Memerlukan 3 sampel berturut-turut & selesai otomatis', async () => {
    const baseTime = Date.now();

    // Sampel 1: 95 km/h (> 80 km/h) -> Belum memicu alert (counter = 1)
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 95,
      recordedAt: new Date(baseTime).toISOString(),
    });
    let alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'kecepatan' });
    expect((alerts.data || alerts).length).toBe(0);

    // Sampel 2: 92 km/h -> Belum memicu alert (counter = 2)
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6708,
      lng: 115.2129,
      speedKmh: 92,
      recordedAt: new Date(baseTime + 3000).toISOString(),
    });
    alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'kecepatan' });
    expect((alerts.data || alerts).length).toBe(0);

    // Sampel 3: 98 km/h -> MEMICU alert (counter = 3)
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6710,
      lng: 115.2132,
      speedKmh: 98,
      recordedAt: new Date(baseTime + 6000).toISOString(),
    });
    alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'kecepatan' });
    const items = alerts.data || alerts;
    expect(items.length).toBe(1);
    expect(items[0].severity).toBe('warning');
    expect(items[0].details.speedKmh).toBe(98);

    // Sampel 4: Kecepatan kembali normal (60 km/h) -> Selesai otomatis
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6712,
      lng: 115.2135,
      speedKmh: 60,
      recordedAt: new Date(baseTime + 9000).toISOString(),
    });
    alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'kecepatan' });
    expect((alerts.data || alerts).length).toBe(0);
  });

  test('2. Baterai Rendah & Daya Terputus (daya_terputus = severity high)', async () => {
    const baseTime = Date.now();

    // A. Baterai drop ke 15% (< 20%) -> Memicu peringatan baterai_rendah
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 10,
      batteryPct: 15,
      powerConnected: true,
      recordedAt: new Date(baseTime).toISOString(),
    });
    let alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'baterai_rendah' });
    expect((alerts.data || alerts).length).toBe(1);

    // Baterai naik kembali ke 30% -> Auto-resolved
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 10,
      batteryPct: 30,
      powerConnected: true,
      recordedAt: new Date(baseTime + 2000).toISOString(),
    });
    alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'baterai_rendah' });
    expect((alerts.data || alerts).length).toBe(0);

    // B. Daya aki terputus -> Memicu daya_terputus dengan severity 'high'
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 0,
      powerConnected: false,
      recordedAt: new Date(baseTime + 4000).toISOString(),
    });
    const powerAlerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'daya_terputus' });
    const pItems = powerAlerts.data || powerAlerts;
    expect(pItems.length).toBe(1);
    expect(pItems[0].severity).toBe('high');

    // Daya tersambung kembali -> Auto-resolved
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 0,
      powerConnected: true,
      recordedAt: new Date(baseTime + 6000).toISOString(),
    });
    const resolvedPowerAlerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'daya_terputus' });
    expect((resolvedPowerAlerts.data || resolvedPowerAlerts).length).toBe(0);
  });

  test('3. Masuk Area Terlarang (masuk_area_terlarang, severity high)', async () => {
    const baseTime = Date.now();

    // Masuk ke titik pusat zona merah (-8.7200, 115.1800)
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.7200,
      lng: 115.1800,
      speedKmh: 20,
      accuracyM: 10,
      recordedAt: new Date(baseTime).toISOString(),
    });

    const alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'masuk_area_terlarang' });
    const items = alerts.data || alerts;
    expect(items.length).toBe(1);
    expect(items[0].severity).toBe('high');
    expect(items[0].details.geofenceId).toBe(forbiddenGeofence.id);

    // Keluar dari area terlarang -> Auto-resolved
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 20,
      accuracyM: 10,
      recordedAt: new Date(baseTime + 5000).toISOString(),
    });

    const afterAlerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'masuk_area_terlarang' });
    expect((afterAlerts.data || afterAlerts).length).toBe(0);
  });

  test('4. Gerak Tanpa Sewa (gerak_tanpa_sewa, indikasi pencurian, severity high)', async () => {
    const baseTime = Date.now();

    // Motor bergerak 1 km dari markas tanpa ada booking berjalan, mesin menyala
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6800, // ~1.1 km dari markas
      lng: 115.2126,
      speedKmh: 35,
      ignition: true,
      recordedAt: new Date(baseTime).toISOString(),
    });

    const alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'gerak_tanpa_sewa' });
    const items = alerts.data || alerts;
    expect(items.length).toBe(1);
    expect(items[0].severity).toBe('high');
    expect(items[0].bookingId).toBeNull();

    // Motor kembali ke markas dan mesin dimatikan -> Selesai otomatis
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.670458,
      lng: 115.212629,
      speedKmh: 0,
      ignition: false,
      recordedAt: new Date(baseTime + 10000).toISOString(),
    });

    const resolvedAlerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'gerak_tanpa_sewa' });
    expect((resolvedAlerts.data || resolvedAlerts).length).toBe(0);
  });

  test('5. Pengabaian Derau GPS (Noise Filtering)', async () => {
    const baseTime = Date.now();

    // Posisi di zona terlarang TETAPI akurasi buruk (accuracyM = 150 > 100m)
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.7200,
      lng: 115.1800,
      speedKmh: 0,
      accuracyM: 150, // Akurasi buruk -> diabaikan untuk keputusan area
      recordedAt: new Date(baseTime).toISOString(),
    });

    const alerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'masuk_area_terlarang' });
    expect((alerts.data || alerts).length).toBe(0);
  });

  test('6. Offline Alert & Pemulihan Otomatis Saat Sinyal Diterima Kembali', async () => {
    // Buat alert offline secara manual (seperti yang dibuat checkOfflineDevices)
    const alert = await gpsRepo.createOrIncrementAlert({
      deviceId: testDevice.id,
      motorcycleId: testDevice.motorcycleId,
      type: 'offline',
      severity: 'warning',
      details: { offlineMinutes: 20 },
      dedupeKey: `offline:${testDevice.id}`,
    });
    expect(alert.status).toBe('open');

    // Terima sinyal baru -> autoResolveOffline otomatis menutup alert offline
    await gpsAlertService.evaluatePosition(testDevice, {
      lat: -8.6705,
      lng: 115.2127,
      speedKmh: 0,
      recordedAt: new Date().toISOString(),
    });

    const offlineAlerts = await gpsRepo.listAlerts({ deviceId: testDevice.id, status: 'open', type: 'offline' });
    expect((offlineAlerts.data || offlineAlerts).length).toBe(0);
  });

  test('7. Deduplikasi Parsial (dedupe_key) Mencegah Pembuatan Alert Ganda', async () => {
    const dedupeKey = `test_dedupe:${testDevice.id}`;

    const alert1 = await gpsRepo.createOrIncrementAlert({
      deviceId: testDevice.id,
      motorcycleId: testDevice.motorcycleId,
      type: 'kecepatan',
      severity: 'warning',
      details: { sample: 1 },
      dedupeKey,
    });
    expect(alert1.occurrences).toBe(1);

    // Panggil kedua kali dengan dedupeKey yang sama saat status masih open
    const alert2 = await gpsRepo.createOrIncrementAlert({
      deviceId: testDevice.id,
      motorcycleId: testDevice.motorcycleId,
      type: 'kecepatan',
      severity: 'warning',
      details: { sample: 2 },
      dedupeKey,
    });

    // ID alert harus sama persis (tidak menambah baris baru), tetapi occurrences bertambah menjadi 2
    expect(alert2.id).toBe(alert1.id);
    expect(alert2.occurrences).toBe(2);

    // Selesaikan
    await gpsRepo.resolveAlert(alert1.id, 'Selesai diuji');
  });
});
