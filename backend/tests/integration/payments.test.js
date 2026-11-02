const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');
const env = require('../../src/config/env');

describe('Integration Test: Payments & Webhook', () => {
  let authTokenDemo;

  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    authTokenDemo = login.body.data.token;
  });

  test('POST /api/payments/create membuat instruksi pembayaran (bank_transfer / qris)', async () => {
    // Booking 5 berstatus pending
    const res = await request(app)
      .post('/api/payments/create')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({
        bookingId: 5,
        method: 'bank_transfer',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.instructions).toHaveProperty('vaNumber');
    expect(res.body.data.instructions.steps).toBeInstanceOf(Array);
  });

  test('POST /api/payments/:id/simulate-pay mengonfirmasi pembayaran pada mode simulasi', async () => {
    const res = await request(app)
      .post('/api/payments/5/simulate-pay')
      .set('Authorization', `Bearer ${authTokenDemo}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.paidAt).toBeDefined();
  });

  test('GET /api/payments/booking/:bookingId mengembalikan status pembayaran', async () => {
    const res = await request(app)
      .get('/api/payments/booking/3')
      .set('Authorization', `Bearer ${authTokenDemo}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
  });

  test('POST /api/payments/notification memproses webhook secara idempotent dengan verifikasi signature', async () => {
    const webhookPayload = {
      bookingCode: 'RK-50724', // Booking ID 5 (pending)
      status: 'settlement',
    };

    // Tolak tanpa signature
    const rejectNoSig = await request(app)
      .post('/api/payments/notification')
      .send(webhookPayload);
    expect(rejectNoSig.status).toBe(401);

    // Lolos dengan signature valid
    const successRes = await request(app)
      .post('/api/payments/notification')
      .set('X-Callback-Signature', env.WEBHOOK_SECRET)
      .send(webhookPayload);

    expect(successRes.status).toBe(200);
    expect(successRes.body.data.idempotent).toBe(true);

    // Panggilan kedua identik tidak menimbulkan error (idempotent)
    const secondRes = await request(app)
      .post('/api/payments/notification')
      .set('X-Callback-Signature', env.WEBHOOK_SECRET)
      .send(webhookPayload);

    expect(secondRes.status).toBe(200);
  });
});
