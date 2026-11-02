const request = require('supertest');
const app = require('../../src/app');
const { addDays, format } = require('date-fns');

describe('Integration Test: Motorcycles Endpoints & Options', () => {
  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }
  });

  test('GET /api/motorcycles mendukung filter multi-merek dan multi-tipe dipisah koma', async () => {
    const res = await request(app).get('/api/motorcycles?brand=Honda,Yamaha&type=matic&limit=6');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((m) => {
      expect(['Honda', 'Yamaha']).toContain(m.brand);
      expect(m.type).toBe('matic');
      expect(m.image).toBeDefined();
      expect(m.ratingAvg).toBeDefined();
    });
  });

  test('GET /api/motorcycles dengan parameter tanggal menyertakan estimatedTotal dan status available', async () => {
    const today = new Date();
    const start = format(addDays(today, 10), 'yyyy-MM-dd');
    const end = format(addDays(today, 13), 'yyyy-MM-dd'); // 3 hari

    const res = await request(app).get(`/api/motorcycles?start=${start}&end=${end}&availableOnly=true`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((m) => {
      expect(m.available).toBe(true);
      expect(m.estimatedTotal).toBe(m.pricePerDay * 3);
    });
  });

  test('Motor dengan status maintenance tidak pernah tampil di endpoint publik', async () => {
    const res = await request(app).get('/api/motorcycles?limit=50');
    expect(res.status).toBe(200);

    const ids = res.body.data.map((m) => m.id);
    // Motor 10 (KLX 150) dan 13 (Satria F150) berstatus maintenance di seed
    expect(ids).not.toContain(10);
    expect(ids).not.toContain(13);
  });

  test('GET /api/motorcycles/filters mengembalikan daftar merek, tipe, transmisi, dan rentang harga', async () => {
    const res = await request(app).get('/api/motorcycles/filters');

    expect(res.status).toBe(200);
    expect(res.body.data.brands).toBeInstanceOf(Array);
    expect(res.body.data.types).toBeInstanceOf(Array);
    expect(res.body.data.transmissions).toBeInstanceOf(Array);
    expect(res.body.data.price).toHaveProperty('min');
    expect(res.body.data.price).toHaveProperty('max');
  });

  test('GET /api/motorcycles/featured?limit=6 mengembalikan maksimal 6 motor rekomendasi', async () => {
    const res = await request(app).get('/api/motorcycles/featured?limit=6');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(6);
    expect(res.body.data[0].ratingAvg).toBeDefined();
  });

  test('GET /api/motorcycles/:idOrSlug mengembalikan detail motor lengkap beserta ratingDistribution', async () => {
    const res = await request(app).get('/api/motorcycles/honda-beat');

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('honda-beat');
    expect(res.body.data.rentalRules).toBeDefined();
    expect(res.body.data.ratingDistribution).toBeDefined();
    expect(res.body.data.ratingDistribution).toHaveProperty('5');
  });

  test('GET /api/motorcycles/:id/unavailable-dates mengembalikan array tanggal terisi', async () => {
    const res = await request(app).get('/api/motorcycles/1/unavailable-dates');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/motorcycles/:id/availability mengembalikan status ketersediaan dan tanggal terdekat', async () => {
    const today = new Date();
    const start = format(addDays(today, 20), 'yyyy-MM-dd');
    const end = format(addDays(today, 23), 'yyyy-MM-dd');

    const res = await request(app).get(`/api/motorcycles/1/availability?start=${start}&end=${end}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('available');
    expect(res.body.data).toHaveProperty('conflictDates');
    expect(res.body.data).toHaveProperty('nextAvailable');
  });

  test('GET /api/motorcycles/:id/reviews mengembalikan daftar ulasan dan ringkasan', async () => {
    const res = await request(app).get('/api/motorcycles/1/reviews');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.ratingDistribution).toBeDefined();
  });

  test('GET /api/meta/rental-options mengembalikan opsi lokasi, add-on, dan biaya antar-jemput', async () => {
    const res = await request(app).get('/api/meta/rental-options');

    expect(res.status).toBe(200);
    expect(res.body.data.pickupLocations).toBeInstanceOf(Array);
    expect(res.body.data.addOns).toBeInstanceOf(Array);
    expect(res.body.data.deliveryFees).toHaveProperty('pickup');
    expect(res.body.data.rules).toHaveProperty('minDays');
  });
});
