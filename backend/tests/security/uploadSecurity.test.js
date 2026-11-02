const request = require('supertest');
const app = require('../../src/app');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { pool } = require('../../db/pool');

describe('Security Test: Keamanan Unggah Berkas & Akses Dokumen Sensitif (Upload Security)', () => {
  let user, userToken;

  beforeAll(async () => {
    await cleanDatabase();
    user = await factory.createUser({ email: 'sec_upload@rodakita.id' });
    userToken = jwt.sign({ id: user.id, role: 'customer', email: user.email }, env.JWT_SECRET);
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  // Valid JPEG header bytes (FF D8 FF E0)
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]);

  describe('Verifikasi Tipe Berkas & Magic Bytes', () => {
    test('Mengunggah file teks/skrip palsu yang dinamai .jpg ditolak (magic bytes mismatch)', async () => {
      const fakeJpgBuffer = Buffer.from('<?php echo "evil shell"; ?>');

      const res = await request(app)
        .post('/api/auth/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('ktp', fakeJpgBuffer, 'malicious.jpg');

      expect([400, 415]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    test('Mengunggah file dengan ekstensi ganda (.php.jpg) yang isinya skrip ditolak', async () => {
      const evilBuffer = Buffer.from('#!/bin/bash\nrm -rf /');

      const res = await request(app)
        .post('/api/auth/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('ktp', evilBuffer, 'shell.php.jpg');

      expect([400, 415]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    test('File dengan magic bytes valid (JPEG nyata) berhasil diterima', async () => {
      const res = await request(app)
        .post('/api/auth/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('ktp', validJpegBuffer, 'identitas-asli.jpg');

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });

    test('Mengunggah berkas melebihi batas ukuran (over 5MB) ditolak', async () => {
      const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB

      const res = await request(app)
        .post('/api/auth/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('ktp', oversizedBuffer, 'too-large.jpg');

      expect([400, 413]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Proteksi Dokumen Pribadi (KTP & SIM) dari Akses Publik Statis', () => {
    test('Direktori /uploads/documents TIDAK BOLEH di-serve secara publik tanpa otentikasi', async () => {
      const res = await request(app).get('/uploads/documents/identitas-asli.jpg');

      // Wajib 404 Not Found (karena tidak ada static route untuk documents)
      expect(res.status).toBe(404);
    });

    test('Path traversal pada unduhan dokumen ditolak', async () => {
      const res = await request(app)
        .get('/api/auth/documents/..%2f..%2f..%2fetc%2fpasswd')
        .set('Authorization', `Bearer ${userToken}`);

      expect([400, 404]).toContain(res.status);
    });
  });
});
