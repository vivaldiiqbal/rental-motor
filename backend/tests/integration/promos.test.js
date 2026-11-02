const request = require('supertest');
const app = require('../../src/app');
const { loadSeed } = require('../../db/seeds/loadSeed');

describe('Integration Test: Promos', () => {
  beforeAll(async () => {
    await loadSeed();
  });
  test('GET /api/promos mengembalikan daftar kode promo aktif', async () => {
    const res = await request(app).get('/api/promos');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((p) => p.code === 'HEMAT10')).toBe(true);
  });

  test('POST /api/promos/validate memvalidasi kode promo HEMAT10 dengan benar', async () => {
    const res = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'HEMAT10',
        subtotal: 200000,
        days: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.discount).toBe(20000); // 10% dari 200.000 = 20.000
    expect(res.body.data.finalSubtotal).toBe(180000);
  });

  test('POST /api/promos/validate menolak kode promo yang tidak terdaftar dengan 400 PROMO_INVALID', async () => {
    const res = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'PROMO_PALSU_99',
        subtotal: 100000,
        days: 2,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PROMO_INVALID');
  });
});
