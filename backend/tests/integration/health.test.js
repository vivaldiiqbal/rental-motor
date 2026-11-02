const request = require('supertest');
const app = require('../../src/app');

describe('Integration Test: Health Endpoint', () => {
  test('GET /api/health mengembalikan status 200, status UP, dan header X-Request-Id', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.data.version).toBe('1.0.0');
    expect(typeof res.body.data.uptime).toBe('number');
  });

  test('GET / (root) mengembalikan informasi dasar layanan RodaKita', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Running');
  });
});
