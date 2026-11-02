const { pool } = require('../../db/pool');
const { runMigrations } = require('../../db/migrate');
const { resetDatabase } = require('../../db/reset');
const { verifyDatabase } = require('../../db/verify');
const { importJson } = require('../../db/importJson');

describe('Integration Test: Migrations Lifecycle, Idempotency & DB Verification', () => {
  beforeAll(async () => {
    // Pastikan berada di database tes
    if (process.env.USE_DB === 'postgres') {
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT current_database() AS dbname');
        expect(res.rows[0].dbname).toMatch(/_test$/);
      } finally {
        client.release();
      }
    }
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  }, 15000);

  test('1. Migrasi Ulang (Idempotensi): Dijalankan kedua kali tanpa error dan tanpa efek (count = 0)', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const result = await runMigrations();
    expect(result.success).toBe(true);
    expect(result.count).toBe(0); // Seluruh migrasi sudah diterapkan sebelumnya
  });

  test('2. Deteksi Checksum Mismatch (Anti-Tampering): Menolak jika file migrasi yang telah dijalankan dimanipulasi', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // Ubah checksum migrasi 001_extensions.sql di schema_migrations menjadi hash palsu
      await client.query(`
        UPDATE schema_migrations
        SET checksum = 'tampered_fake_checksum_00000000000000000000000000000000000000000'
        WHERE name = '001_extensions.sql'
      `);

      // Jalankan migrasi: harus melempar error checksum mismatch
      await expect(runMigrations()).rejects.toThrow(/Checksum mismatch/);

      // Kembalikan hash asli dengan menghitung sha256 asli dari file
      const crypto = require('crypto');
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(__dirname, '../../db/migrations/001_extensions.sql');
      const realChecksum = crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf8')).digest('hex');

      await client.query(`
        UPDATE schema_migrations
        SET checksum = $1
        WHERE name = '001_extensions.sql'
      `, [realChecksum]);
    } finally {
      client.release();
    }
  });

  test('3. Reset & Verifikasi Integritas: db:reset lalu db:verify menghasilkan 0 temuan pelanggaran', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    // Reset database skema public dari awal
    const resetRes = await resetDatabase();
    expect(resetRes.success).toBe(true);

    // Jalankan verifikasi integritas 10 titik
    const verifyReport = await verifyDatabase();
    expect(verifyReport.success).toBe(true);
    expect(verifyReport.issuesCount).toBe(0);
  });

  test('4. Idempotensi Import JSON: db:import-json dijalankan dua kali berturut-turut tanpa duplikasi data', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // 1. Jalankan import pertama
      const import1 = await importJson();
      expect(import1.success).toBe(true);

      const countMotors1 = await client.query('SELECT COUNT(*)::int AS cnt FROM motorcycles');
      const countBookings1 = await client.query('SELECT COUNT(*)::int AS cnt FROM bookings');
      const countUsers1 = await client.query('SELECT COUNT(*)::int AS cnt FROM users');

      // 2. Jalankan import kedua kali
      const import2 = await importJson();
      expect(import2.success).toBe(true);

      const countMotors2 = await client.query('SELECT COUNT(*)::int AS cnt FROM motorcycles');
      const countBookings2 = await client.query('SELECT COUNT(*)::int AS cnt FROM bookings');
      const countUsers2 = await client.query('SELECT COUNT(*)::int AS cnt FROM users');

      // Jumlah baris tidak boleh bertambah (nol duplikasi)
      expect(countMotors2.rows[0].cnt).toBe(countMotors1.rows[0].cnt);
      expect(countBookings2.rows[0].cnt).toBe(countBookings1.rows[0].cnt);
      expect(countUsers2.rows[0].cnt).toBe(countUsers1.rows[0].cnt);

      // Verifikasi ulang bahwa data tetap valid
      const verifyReport = await verifyDatabase();
      expect(verifyReport.issuesCount).toBe(0);
    } finally {
      client.release();
    }
  });
});
