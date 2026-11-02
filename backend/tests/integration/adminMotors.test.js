const request = require('supertest');
const app = require('../../src/app');
const { store, motorRepo, gpsRepo, bookingRepo, maintenanceRepo, userRepo } = require('../../src/repositories');
const { toISODate, getNowWIB } = require('../../src/utils/dates');

describe('Integration Test: Admin Motorcycles List & RBAC (Tahap 3)', () => {
  let adminToken;
  let staffToken;
  let customerToken;

  beforeEach(async () => {
    if (store && typeof store.resetToSeed === 'function') {
      store.resetToSeed();
    }
    if (process.env.USE_DB === 'postgres') {
      const { pool } = require('../../db/pool');
      await pool.query('TRUNCATE TABLE pricing_rules, discount_tiers CASCADE');
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }
    const pricingService = require('../../src/services/pricingService');
    if (pricingService && typeof pricingService.invalidateCache === 'function') {
      pricingService.invalidateCache();
    }

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminLogin.body.data.token;

    // Pastikan staff user siap
    const staffUser = await userRepo.findByEmail('staff@rodakita.id');
    if (staffUser) {
      const staffLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@rodakita.id', password: 'Staff12345' });
      staffToken = staffLogin.body.data?.token;
    }
    if (!staffToken) {
      const u2 = await userRepo.findByEmail('budi@gmail.com');
      await userRepo.update(u2.id, { role: 'staff' });
      const staffLogin2 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'budi@gmail.com', password: 'Budi12345' });
      staffToken = staffLogin2.body.data.token;
    }

    const demoLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerToken = demoLogin.body.data.token;
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { pool } = require('../../db/pool');
      await pool.query('TRUNCATE TABLE pricing_rules, discount_tiers CASCADE');
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }
  });

  test('1. Admin dan Staff menerima daftar motor lengkap dengan plat penuh, status data, status operasional Bahasa Indonesia, dan ringkasan GPS', async () => {
    for (const token of [adminToken, staffToken]) {
      const res = await request(app)
        .get('/api/admin/motorcycles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      for (const m of res.body.data) {
        expect(m.id).toBeDefined();
        expect(m.name).toBeDefined();
        expect(m.brand).toBeDefined();
        expect(m.type).toBeDefined();
        expect(m.cc).toBeDefined();
        expect(m.year).toBeDefined();
        expect(m.pricePerDay).toBeDefined();
        // Plat nomor lengkap (tidak disamarkan dengan ***)
        expect(typeof m.plate).toBe('string');
        expect(m.plate.length).toBeGreaterThan(0);
        expect(m.plate).not.toContain('***');
        expect(m.plateNumber).toBe(m.plate);
        // Status data motor (active | maintenance | inactive)
        expect(['active', 'maintenance', 'inactive']).toContain(m.dataStatus);
        // Status operasional Bahasa Indonesia (Tersedia, Disewa, Servis, Nonaktif)
        expect(['Tersedia', 'Disewa', 'Servis', 'Nonaktif']).toContain(m.operationalStatus);
        // Ringkasan GPS
        expect(['no_device', 'online', 'offline', 'alert']).toContain(m.gpsStatus);
        expect(m.gps).toBeDefined();
        expect(typeof m.gps.hasDevice).toBe('boolean');
      }
    }
  });

  test('2. Tes Pelindung: Endpoint publik (/api/motorcycles & /api/motors) tetap menyamarkan plat nomor dengan ***', async () => {
    const pubRes1 = await request(app).get('/api/motorcycles');
    expect(pubRes1.status).toBe(200);
    expect(pubRes1.body.data.length).toBeGreaterThan(0);
    for (const m of pubRes1.body.data) {
      if (m.plate || m.plateNumber) {
        expect(m.plate || m.plateNumber).toContain('***');
      }
    }

    const pubRes2 = await request(app).get('/api/motors');
    expect(pubRes2.status).toBe(200);
    for (const m of pubRes2.body.data) {
      // Endpoint /api/motors publik tidak membocorkan plat asli
      if (m.plate || m.plateNumber) {
        expect(m.plate || m.plateNumber).toContain('***');
      }
    }
  });

  test('3. Izin RBAC: Pelanggan ditolak (403); Staff boleh melihat tetapi ditolak menambah/mengubah/menonaktifkan (403)', async () => {
    // Pelanggan ditolak melihat daftar admin
    const custRes = await request(app)
      .get('/api/admin/motorcycles')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(custRes.status).toBe(403);

    const custFilterRes = await request(app)
      .get('/api/admin/motorcycles/filters')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(custFilterRes.status).toBe(403);

    // Staff boleh melihat daftar dan opsi filter
    const staffList = await request(app)
      .get('/api/admin/motorcycles')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffList.status).toBe(200);

    const staffFilters = await request(app)
      .get('/api/admin/motorcycles/filters')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffFilters.status).toBe(200);

    // Staff ditolak menambah motor baru
    const staffCreate = await request(app)
      .post('/api/admin/motorcycles')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Motor Staff', brand: 'Honda', type: 'matic', plate: 'DK 9999 ST', pricePerDay: 100000 });
    expect(staffCreate.status).toBe(403);

    // Staff ditolak mengubah motor
    const staffUpdate = await request(app)
      .put('/api/admin/motorcycles/1')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Ubah Oleh Staff' });
    expect(staffUpdate.status).toBe(403);

    // Staff ditolak mengubah status motor
    const staffStatus = await request(app)
      .patch('/api/admin/motorcycles/1/status')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'inactive' });
    expect(staffStatus.status).toBe(403);
  });

  test('4. Parameter query aneh/tidak valid jatuh ke default tanpa menghasilkan 500', async () => {
    const res = await request(app)
      .get('/api/admin/motorcycles?page=-99&limit=abc&sort=aneh_sekali&sortDir=invalid&status=tidak_ada')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(50);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('5. Filter, pencarian, urutan (sort), paginasi, dan opsi filter dinamis bekerja akurat', async () => {
    // Opsi filter dari database nyata
    const filterRes = await request(app)
      .get('/api/admin/motorcycles/filters')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.brands).toEqual(expect.arrayContaining(['Honda', 'Yamaha', 'Vespa', 'Kawasaki', 'Suzuki']));
    expect(filterRes.body.data.types).toEqual(expect.arrayContaining(['matic', 'trail', 'sport', 'manual']));

    // Filter merek Honda
    const hondaRes = await request(app)
      .get('/api/admin/motorcycles?brand=Honda')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hondaRes.status).toBe(200);
    expect(hondaRes.body.data.length).toBeGreaterThan(0);
    expect(hondaRes.body.data.every((m) => m.brand === 'Honda')).toBe(true);

    // Filter status Servis (maintenance)
    const maintRes = await request(app)
      .get('/api/admin/motorcycles?status=maintenance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(maintRes.status).toBe(200);
    expect(maintRes.body.data.length).toBeGreaterThan(0);
    expect(maintRes.body.data.every((m) => m.status === 'maintenance' && m.operationalStatus === 'Servis')).toBe(true);

    // Urutan harga termurah ke termahal (price-asc)
    const sortAsc = await request(app)
      .get('/api/admin/motorcycles?sort=price-asc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sortAsc.status).toBe(200);
    for (let i = 1; i < sortAsc.body.data.length; i++) {
      expect(sortAsc.body.data[i].pricePerDay).toBeGreaterThanOrEqual(sortAsc.body.data[i - 1].pricePerDay);
    }

    // Paginasi limit=5, page=1 dan page=2
    const page1 = await request(app)
      .get('/api/admin/motorcycles?limit=5&page=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const page2 = await request(app)
      .get('/api/admin/motorcycles?limit=5&page=2')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page1.body.data.length).toBe(5);
    expect(page2.body.data.length).toBe(5);
    expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
  });

  test('6. Motor tanpa perangkat GPS, tanpa foto, tanpa ulasan, atau tanpa booking tidak memicu error', async () => {
    const createRes = await request(app)
      .post('/api/admin/motorcycles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Motor Polos Tanpa GPS Foto Ulasan',
        brand: 'Suzuki',
        type: 'manual',
        plate: 'DK 7070 PL',
        pricePerDay: 85000,
        images: [],
        features: [],
      });
    expect(createRes.status).toBe(201);
    const newId = createRes.body.data.id;

    const listRes = await request(app)
      .get('/api/admin/motorcycles?search=DK 7070 PL')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);

    const motor = listRes.body.data[0];
    expect(motor.id).toBe(newId);
    expect(motor.plate).toBe('DK 7070 PL');
    expect(motor.gpsStatus).toBe('no_device');
    expect(motor.gpsStatusLabel).toBe('Belum ada alat GPS');
    expect(motor.gps.hasDevice).toBe(false);
    expect(motor.images).toEqual([]);
    expect(motor.primaryImage).toBeNull();
    expect(motor.reviewCount).toBe(0);
    expect(motor.operationalStatus).toBe('Tersedia');
  });

  test('7. Bebas N+1: Jumlah kueri repository tetap konstan untuk 5 motor maupun 50 motor', async () => {
    // Tambahkan hingga >= 50 motor
    const current = await motorRepo.findAll({}, { page: 1, limit: 100 });
    const startCount = current.items.length;
    for (let i = startCount + 1; i <= 52; i++) {
      await motorRepo.create({
        name: `Motor Uji Skala ${i}`,
        slug: `motor-uji-skala-${i}`,
        brand: 'Honda',
        type: 'matic',
        cc: 125,
        year: 2024,
        color: 'Hitam',
        transmission: 'Otomatis',
        pricePerDay: 90000,
        deposit: 200000,
        plate: `DK ${8000 + i} SK`,
        status: 'available',
      });
    }

    const spyMotorFindAll = jest.spyOn(motorRepo, 'findAll');
    const spyMotorFindById = jest.spyOn(motorRepo, 'findById');
    const spyGpsListDevices = jest.spyOn(gpsRepo, 'listDevices');
    const spyGpsListAlerts = jest.spyOn(gpsRepo, 'listAlerts');
    const spyBookingFindAll = jest.spyOn(bookingRepo, 'findAll');
    const spyMaintFindAll = jest.spyOn(maintenanceRepo, 'findAll');

    try {
      // Request 1: limit=5
      await request(app)
        .get('/api/admin/motorcycles?limit=5&page=1')
        .set('Authorization', `Bearer ${adminToken}`);

      const callsFor5 = {
        motorFindAll: spyMotorFindAll.mock.calls.length,
        motorFindById: spyMotorFindById.mock.calls.length,
        gpsDevices: spyGpsListDevices.mock.calls.length,
        gpsAlerts: spyGpsListAlerts.mock.calls.length,
        bookings: spyBookingFindAll.mock.calls.length,
        maintenance: spyMaintFindAll.mock.calls.length,
      };

      expect(callsFor5.motorFindById).toBe(0);
      expect(callsFor5.motorFindAll).toBe(1);
      expect(callsFor5.gpsDevices).toBe(1);

      spyMotorFindAll.mockClear();
      spyMotorFindById.mockClear();
      spyGpsListDevices.mockClear();
      spyGpsListAlerts.mockClear();
      spyBookingFindAll.mockClear();
      spyMaintFindAll.mockClear();

      // Request 2: limit=50
      const res50 = await request(app)
        .get('/api/admin/motorcycles?limit=50&page=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res50.status).toBe(200);
      expect(res50.body.data.length).toBe(50);

      const callsFor50 = {
        motorFindAll: spyMotorFindAll.mock.calls.length,
        motorFindById: spyMotorFindById.mock.calls.length,
        gpsDevices: spyGpsListDevices.mock.calls.length,
        gpsAlerts: spyGpsListAlerts.mock.calls.length,
        bookings: spyBookingFindAll.mock.calls.length,
        maintenance: spyMaintFindAll.mock.calls.length,
      };

      expect(callsFor50).toEqual(callsFor5);
    } finally {
      spyMotorFindAll.mockRestore();
      spyMotorFindById.mockRestore();
      spyGpsListDevices.mockRestore();
      spyGpsListAlerts.mockRestore();
      spyBookingFindAll.mockRestore();
      spyMaintFindAll.mockRestore();
    }
  });
});
