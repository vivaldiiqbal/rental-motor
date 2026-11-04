const { pool } = require('../../db/pool');
const logger = require('./logger');

/**
 * Memastikan akun Admin utama (admin@rodakita.id) selalu tersedia di tabel users.
 * Hanya memastikan akun Admin tunggal tersedia tanpa menambah data dummy.
 */
async function ensureAdminAccount() {
  try {
    const res = await pool.query(
      "SELECT id, role, is_active FROM users WHERE email = 'admin@rodakita.id' LIMIT 1"
    );

    if (res.rows.length === 0) {
      const defaultHash = '$2b$10$s01iUUEugagZ83sldBj4p.2iZuh2SDHjz4mWJPM/FHZT5M.Ul9MWK'; // Admin12345
      await pool.query(
        `INSERT INTO users (name, email, role, phone, password_hash, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        ['Admin RodaKita', 'admin@rodakita.id', 'admin', '+628111222333', defaultHash, true]
      );
      logger.info('[AUTH] Akun Admin utama (admin@rodakita.id) berhasil dipastikan di PostgreSQL.');
    } else {
      const admin = res.rows[0];
      if (admin.role !== 'admin' || !admin.is_active) {
        await pool.query(
          "UPDATE users SET role = 'admin', is_active = true WHERE id = $1",
          [admin.id]
        );
      }
    }
  } catch (err) {
    logger.warn('[AUTH] Gagal memverifikasi akun Admin utama:', err.message);
  }
}

module.exports = { ensureAdminAccount };
