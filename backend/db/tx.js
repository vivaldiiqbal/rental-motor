const { pool } = require('./pool');
const env = require('../src/config/env');
const logger = require('../src/utils/logger');
const store = require('../src/repositories/store');

const TRANSIENT_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
]);

/**
 * Helper eksekusi transaksi database dengan penanganan retry otomatis
 * pada kegagalan konkurensi (serialization failure / deadlock).
 *
 * Mendukung mode driver ganda (PostgreSQL & fallback In-Memory).
 *
 * @param {Function} callback (client) => Promise<T>
 * @param {Object} options { isolationLevel: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE', maxRetries: number }
 * @returns {Promise<T>}
 */
async function withTransaction(callback, options = {}) {
  // Jika sedang berjalan dengan driver in-memory, delegasikan ke store.withLock
  if (env.USE_DB === 'memory') {
    return store.withLock(async (data) => {
      return callback({ isMemory: true, data });
    });
  }

  const {
    isolationLevel = 'READ COMMITTED',
    maxRetries = 3,
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt < maxRetries) {
    attempt++;
    const client = await pool.connect();

    try {
      // 1. Mulai transaksi dengan tingkat isolasi yang ditentukan
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

      // 2. Set timeout proteksi agar transaksi menggantung tidak membebani pool
      const idleTimeout = parseInt(process.env.DB_IDLE_TX_TIMEOUT_MS || env.DB_IDLE_TX_TIMEOUT_MS || 15000, 10);
      const statementTimeout = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || env.DB_STATEMENT_TIMEOUT_MS || 15000, 10);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${idleTimeout}`);
      await client.query(`SET LOCAL statement_timeout = ${statementTimeout}`);

      // 3. Jalankan callback bisnis dengan client transaksi
      const result = await callback(client);

      // 4. Commit transaksi jika tidak ada error
      await client.query('COMMIT');
      return result;
    } catch (err) {
      lastError = err;
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        logger.error('[TX ROLLBACK ERROR]', rbErr.message);
      }

      // Periksa apakah error termasuk kategori transient error yang aman untuk di-retry
      if (TRANSIENT_PG_CODES.has(err.code) && attempt < maxRetries) {
        const backoffMs = Math.min(200, 50 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 30);
        logger.warn(`[TX RETRY] Percobaan ke-${attempt} gagal (${err.code}). Menunggu ${backoffMs}ms sebelum retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }

  throw lastError;
}

module.exports = {
  withTransaction,
};
