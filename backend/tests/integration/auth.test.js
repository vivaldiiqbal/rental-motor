const request = require('supertest');
const app = require('../../src/app');
const { store } = require('../../src/repositories');

// Buffer JPEG valid (magic bytes: FF D8 FF E0 ...)
const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
]);

describe('Integration Test: Authentication & User Profile', () => {
  beforeEach(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }
  });

  test('POST /api/auth/register mendaftarkan user baru dengan normalisasi nomor telepon dan tanpa passwordHash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Pengguna Baru',
        email: 'PENGGUNA.BARU@example.com',
        phone: '081234567899',
        password: 'Password123',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('pengguna.baru@example.com');
    expect(res.body.data.user.phone).toBe('+6281234567899');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('POST /api/auth/register menolak password tanpa kombinasi angka atau nama terlalu pendek', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'A',
        email: 'test@example.com',
        phone: '081234567890',
        password: 'passwordhanyahuruf',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.some((d) => d.field === 'name')).toBe(true);
    expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
  });

  test('POST /api/auth/login sukses dengan akun demo (demo@rodakita.id / Demo12345)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('demo@rodakita.id');
  });

  test('POST /api/auth/login gagal mengembalikan pesan netral "Email atau sandi salah"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'email.tidak.ada@rodakita.id',
        password: 'Demo12345Salah',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Email atau sandi salah');
  });

  test('POST /api/auth/logout mengembalikan 204 No Content', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });

  test('GET /api/auth/me mengembalikan data profil user beserta docsStatus', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
      });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(1);
    expect(meRes.body.data.docsStatus).toBeDefined();
    expect(meRes.body.data.docsStatus.ktp).toBe('verified');
  });

  test('PUT /api/auth/me memperbarui kontak darurat dan nomor telepon', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
      });

    const token = loginRes.body.data.token;

    const updateRes = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: '081299988877',
        emergencyContact: {
          name: 'Ibu Ratna',
          phone: '081377766655',
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.phone).toBe('+6281299988877');
    expect(updateRes.body.data.emergencyContact.name).toBe('Ibu Ratna');
    expect(updateRes.body.data.emergencyContact.phone).toBe('+6281377766655');
  });

  test('PUT /api/auth/password mengganti kata sandi dan mengembalikan 204 No Content', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
      });

    const token = loginRes.body.data.token;

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'Demo12345',
        newPassword: 'DemoBaru12345',
      });

    expect(res.status).toBe(204);
  });

  test('POST /api/auth/documents menolak berkas PDF dengan 415 UNSUPPORTED_FILE_TYPE', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
      });

    const token = loginRes.body.data.token;

    const res = await request(app)
      .post('/api/auth/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('kind', 'ktp')
      .attach('file', Buffer.from('%PDF-1.4 mock pdf content'), 'ktp.pdf');

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  test('POST /api/auth/documents sukses dengan berkas gambar ber-magic bytes valid', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@rodakita.id',
        password: 'Demo12345',
      });

    const token = loginRes.body.data.token;

    const res = await request(app)
      .post('/api/auth/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('ktp', VALID_JPEG_BUFFER, 'ktp.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ktp).toBe('pending');
  });
});
