const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');
const { addDays, format } = require('date-fns');

describe('Integration Test: Security & Crash-Free Resilience', () => {
  let authTokenDemo;
  let authTokenBudi;

  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    const loginDemo = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    authTokenDemo = loginDemo.body.data.token;

    const loginBudi = await request(app)
      .post('/api/auth/login')
      .send({ email: 'budi@gmail.com', password: 'Budi12345' });
    authTokenBudi = loginBudi.body.data.token;
  });

  test('Keamanan Header: Mematikan x-powered-by dan menyertakan header keamanan Helmet', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers).toHaveProperty('x-request-id');
    expect(res.headers).toHaveProperty('x-content-type-options');
  });

  test('Keamanan Input: Menolak prototype pollution (__proto__, constructor, prototype) dengan 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":"demo@rodakita.id","password":"Demo12345","__proto__":{"isAdmin":true}}');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('prototype pollution');
  });

  test('Sanitasi XSS: Membersihkan tag HTML dari input pengguna untuk mencegah stored XSS', async () => {
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({
        name: '<script>alert("xss")</script>Ilham Bersih',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('alert("xss")Ilham Bersih');
    expect(res.body.data.name).not.toContain('<script>');
  });

  test('Strict Validation: Menolak field tak dikenal pada request body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
        unknownFieldToTamper: 'malicious',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('Batas Ukuran JSON: Menolak payload request yang melebihi batas 100 KB', async () => {
    // String besar > 100 KB
    const bigString = 'A'.repeat(120 * 1024);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: bigString,
      });

    expect(res.status).toBe(413);
  });

  test('Otorisasi Kepemilikan: Akses resource milik orang lain menghasilkan 404 (bukan 403)', async () => {
    // User Budi (User ID 2) mencoba membuat pembayaran untuk Booking ID 1 (milik User Demo ID 1)
    const res = await request(app)
      .post('/api/payments/create')
      .set('Authorization', `Bearer ${authTokenBudi}`)
      .send({
        bookingId: 1,
        method: 'bank_transfer',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('Idempotensi: Header Idempotency-Key mengembalikan booking yang sama tanpa membuat duplikat', async () => {
    const today = new Date();
    const start = format(addDays(today, 100), 'yyyy-MM-dd');
    const end = format(addDays(today, 102), 'yyyy-MM-dd');

    const bookingPayload = {
      motorId: 4,
      startDate: start,
      endDate: end,
      pickupTime: '09:00',
      pickup: 'store',
      payment: 'bank_transfer',
      renter: {
        name: 'Ilham Ramadhan',
        phone: '081234567890',
        email: 'demo@rodakita.id',
      },
    };

    const idempotencyKey = 'unique-req-key-2026-test-abc';

    // Request pertama: membuat booking (201)
    const firstRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(bookingPayload);

    expect(firstRes.status).toBe(201);
    const bookingCode = firstRes.body.data.code;

    // Request kedua dengan Idempotency-Key sama persis: harus mengembalikan hasil yang sama (200) tanpa crash/double booking
    const secondRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(bookingPayload);

    expect(secondRes.status).toBe(200);
    expect(secondRes.headers['idempotent-replay']).toBe('true');
    expect(secondRes.body.data.code).toBe(bookingCode);
  });

  test('Resiliensi Filter: Menolak minPrice > maxPrice dengan 400 terstruktur dan fallback sort aman', async () => {
    const resPrice = await request(app).get('/api/motorcycles?minPrice=300000&maxPrice=100000');
    expect(resPrice.status).toBe(400);
    expect(resPrice.body.error.code).toBe('VALIDATION_ERROR');

    // Input sort ngawur tidak boleh crash, fallback ke default
    const resSort = await request(app).get('/api/motorcycles?sort=random_ngawur_value');
    expect(resSort.status).toBe(200);
    expect(resSort.body.data).toBeInstanceOf(Array);
  });

  test('404 Handler: Rute tidak dikenal mengembalikan JSON standar (bukan HTML)', async () => {
    const res = await request(app).get('/api/rute-tak-dikenal-123');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
