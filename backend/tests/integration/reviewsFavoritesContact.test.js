const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');

describe('Integration Test: Reviews, Favorites, & Contact', () => {
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

  test('POST /api/reviews hanya mengizinkan ulasan untuk booking berstatus completed milik sendiri', async () => {
    // Booking ID 1 adalah milik demo user dan berstatus completed di seed
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({
        bookingId: 1,
        rating: 5,
        comment: 'Pelayanan sangat memuaskan, motor Beat-nya terawat sekali!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rating).toBe(5);

    // Coba ulas lagi untuk booking yang sama (harus ditolak karena 1 booking 1 ulasan)
    const duplicateRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({
        bookingId: 1,
        rating: 4,
        comment: 'Mencoba ulas kedua kali',
      });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.error.message).toContain('sudah pernah');
  });

  test('POST /api/favorites/:motorId dan DELETE /api/favorites/:motorId bersifat idempotent', async () => {
    // Tambah favorit motor 1 (Beat)
    const addRes1 = await request(app)
      .post('/api/favorites/1')
      .set('Authorization', `Bearer ${authTokenDemo}`);
    expect(addRes1.status).toBe(200);

    // Tambah lagi (idempotent)
    const addRes2 = await request(app)
      .post('/api/favorites/1')
      .set('Authorization', `Bearer ${authTokenDemo}`);
    expect(addRes2.status).toBe(200);

    // Cek daftar favorit
    const listRes = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${authTokenDemo}`);
    expect(listRes.body.data.some((m) => m.id === 1)).toBe(true);

    // Hapus favorit motor 1
    const delRes1 = await request(app)
      .delete('/api/favorites/1')
      .set('Authorization', `Bearer ${authTokenDemo}`);
    expect(delRes1.status).toBe(200);

    // Hapus lagi (idempotent)
    const delRes2 = await request(app)
      .delete('/api/favorites/1')
      .set('Authorization', `Bearer ${authTokenDemo}`);
    expect(delRes2.status).toBe(200);
  });

  test('POST /api/favorites/sync menggabungkan array motorIds lokal saat login', async () => {
    const res = await request(app)
      .post('/api/favorites/sync')
      .set('Authorization', `Bearer ${authTokenDemo}`)
      .send({ motorIds: [1, 3, 5] });

    expect(res.status).toBe(200);
    expect(res.body.data.syncedCount).toBeGreaterThanOrEqual(3);
  });

  test('POST /api/contact berhasil menyimpan pesan pelanggan', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Bambang Sudibyo',
        email: 'bambang@example.com',
        subject: 'Tanya sewa bulanan',
        message: 'Apakah ada potongan khusus untuk sewa 1 bulan penuh?',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/contact menolak spam bot jika field honeypot website diisi', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Spam Bot',
        email: 'bot@spammer.com',
        message: 'Beli obat herbal murah sekarang!',
        website: 'http://spam-link.com', // Honeypot terisi
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('spam');
  });
});
