process.env.USE_DB = 'postgres';

const { pool } = require('../../db/pool');
const { cleanDatabase } = require('../helpers/dbClean');
const factory = require('../helpers/factory');
const { verifyDatabase } = require('../../db/verify');

describe('Data Integrity Test: db:verify & Database Invariants on PostgreSQL', () => {
  beforeAll(async () => {
    await cleanDatabase();
    // Inisialisasi admin & settings dasar
    await factory.createAdmin({ email: 'admin_integrity@rodakita.id' });
    await factory.initSettings();
  });

  afterAll(async () => {
    await cleanDatabase();
    await pool.end();
  });

  test('db:verify menghasilkan 0 pelanggaran (success: true, issuesCount: 0) pada basis data bersih', async () => {
    const result = await verifyDatabase(pool);
    expect(result.success).toBe(true);
    expect(result.issuesCount).toBe(0);
  });

  test('Invarian: Tidak boleh ada booking aktif yang beririsan waktu pada motor yang sama', async () => {
    const overlapRes = await pool.query(`
      SELECT b1.id AS id1, b2.id AS id2, b1.booking_code AS code1, b2.booking_code AS code2
      FROM bookings b1
      JOIN bookings b2 ON b1.motorcycle_id = b2.motorcycle_id AND b1.id < b2.id
      WHERE b1.status IN ('pending', 'confirmed', 'active')
        AND b2.status IN ('pending', 'confirmed', 'active')
        AND daterange(b1.start_date, b1.end_date, '[)') && daterange(b2.start_date, b2.end_date, '[)')
    `);
    expect(overlapRes.rows.length).toBe(0);
  });

  test('Invarian: total_days dan total harga (rental_total & grand_total) 100% konsisten', async () => {
    const priceCheckRes = await pool.query(`
      SELECT id, booking_code, total_days, (end_date - start_date) AS diff_days,
             rental_total, (subtotal - duration_discount - promo_discount + addons_total + delivery_total) AS exp_rental,
             grand_total, (rental_total + deposit) AS exp_grand
      FROM bookings
      WHERE total_days <> (end_date - start_date)
         OR grand_total <> (rental_total + deposit)
         OR rental_total <> (subtotal - duration_discount - promo_discount + addons_total + delivery_total)
    `);
    expect(priceCheckRes.rows.length).toBe(0);
  });

  test('Invarian: Seluruh Foreign Key bersih dari baris yatim (No Orphan Rows)', async () => {
    const orphanChecks = [
      { name: 'user_documents -> users', sql: 'SELECT COUNT(*)::int AS cnt FROM user_documents WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'bookings -> users', sql: 'SELECT COUNT(*)::int AS cnt FROM bookings WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'bookings -> motorcycles', sql: 'SELECT COUNT(*)::int AS cnt FROM bookings WHERE motorcycle_id NOT IN (SELECT id FROM motorcycles)' },
      { name: 'payments -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM payments WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'reviews -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM reviews WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'booking_handovers -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_handovers WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'booking_returns -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_returns WHERE booking_id NOT IN (SELECT id FROM bookings)' },
    ];

    for (const check of orphanChecks) {
      const res = await pool.query(check.sql);
      expect(Number(res.rows[0].cnt)).toBe(0);
    }
  });

  test('Invarian: Selalu ada minimal satu akun admin aktif dalam sistem', async () => {
    const res = await pool.query("SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'admin' AND is_active = true");
    expect(Number(res.rows[0].cnt)).toBeGreaterThanOrEqual(1);
  });

  test('Invarian: Trigger audit_logs menolak operasi UPDATE dan DELETE (Append-Only Invariant)', async () => {
    // Buat satu baris audit log
    const auditRes = await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, ip, at)
       VALUES (1, 'system', 'TEST_APPEND', 'test', '127.0.0.1', now())
       RETURNING id`
    );
    const logId = auditRes.rows[0].id;

    // Upaya UPDATE harus ditolak oleh trigger PostgreSQL
    await expect(
      pool.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['TAMPERED', logId])
    ).rejects.toThrow();

    // Upaya DELETE harus ditolak oleh trigger PostgreSQL
    await expect(
      pool.query('DELETE FROM audit_logs WHERE id = $1', [logId])
    ).rejects.toThrow();
  });
});
