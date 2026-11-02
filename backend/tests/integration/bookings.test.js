const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');
const { addDays, format } = require('date-fns');

describe('Integration Test: Bookings & Calendar', () => {
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

  test('POST /api/bookings/quote menghitung rincian sewa tanpa menyimpan ke database', async () => {
    const today = new Date();
    const start = format(addDays(today, 10), 'yyyy-MM-dd');
    const end = format(addDays(today, 12), 'yyyy-MM-dd'); // 2 hari

    const res = await request(app)
      .post('/api/bookings/quote')
      .send({
        motorId: 1, // 75.000 / hari
        start,
        end,
        addons: ['extra_helmet'], // 10.000 / hari * 2 = 20.000
        delivery: { pickup: true, dropoff: true }, // 25.000 + 25.000 = 50.000
        promoCode: 'HEMAT10',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subtotal).toBe(150000);
    expect(res.body.data.deliveryFee).toBe(50000);
    expect(res.body.data.addOnsTotal).toBe(20000);
    expect(res.body.data.discount).toBe(15000); // 10% dari 150.000
    // total = totalRental (150.000 - 15.000) + addOns (20.000) + delivery (50.000) + deposit (200.000)
    expect(res.body.data.total).toBe(135000 + 20000 + 50000 + 200000);
  });

  test('POST /api/bookings membuat pemesanan baru lengkap dengan timeline', async () => {
    const today = new Date();
    const start = format(addDays(today, 30), 'yyyy-MM-dd');
    const end = format(addDays(today, 33), 'yyyy-MM-dd');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({
        motorId: 1,
        startDate: start,
        endDate: end,
        pickupTime: '08:30',
        pickupLocation: 'Bandara Internasional',
        pickup: 'delivery',
        delivery: { pickup: true, dropoff: true },
        payment: 'bank_transfer',
        renter: {
          name: 'Ilham Ramadhan (Demo)',
          phone: '081234567890',
          email: 'demo@rodakita.id',
          idNumber: '3201234567890001',
          emergencyContact: {
            name: 'Ibu Ratna',
            phone: '081377766655',
          },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^RM-\d{6}-[2-9A-HJ-NP-Z]{4}$/);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.timeline).toBeInstanceOf(Array);
    expect(res.body.data.timeline[0].status).toBe('pending');
  });

  test('GET /api/bookings/my mengembalikan daftar booking beserta counts per status untuk tab badge', async () => {
    const res = await request(app)
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${authTokenDemo}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.counts).toBeDefined();
    expect(res.body.meta.counts).toHaveProperty('all');
    expect(res.body.meta.counts).toHaveProperty('pending');
    expect(res.body.meta.counts).toHaveProperty('confirmed');
    expect(res.body.meta.counts).toHaveProperty('active');
    expect(res.body.meta.counts).toHaveProperty('completed');
    expect(res.body.meta.counts).toHaveProperty('cancelled');
  });

  test('GET /api/bookings/:id hanya dapat diakses pemilik, user lain menerima 404 NOT_FOUND', async () => {
    // Booking ID 6 adalah milik Budi (User ID 2)
    const budiAccess = await request(app)
      .get('/api/bookings/6')
      .set('Authorization', `Bearer ${authTokenBudi}`);
    expect(budiAccess.status).toBe(200);
    expect(budiAccess.body.data.id).toBe(6);

    // Demo user (User ID 1) mencoba mengakses booking ID 6 -> harus 404!
    const demoAccess = await request(app)
      .get('/api/bookings/6')
      .set('Authorization', `Bearer ${authTokenDemo}`);
    expect(demoAccess.status).toBe(404);
    expect(demoAccess.body.error.code).toBe('NOT_FOUND');
  });

  test('PUT /api/bookings/:id/cancel membatalkan booking berstatus pending dengan alasan', async () => {
    const res = await request(app)
      .put('/api/bookings/5/cancel')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({ reason: 'Jadwal penerbangan dimajukan' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancellationReason).toBe('Jadwal penerbangan dimajukan');
  });

  test('GET /api/bookings/:id/ics mengembalikan berkas kalender .ics', async () => {
    const res = await request(app)
      .get('/api/bookings/3/ics')
      .set('Authorization', `Bearer ${authTokenDemo}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('SUMMARY:Sewa Motor');
    expect(res.text).toContain('END:VCALENDAR');
  });
});
