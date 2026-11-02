const { Pool, types } = require('pg');
const env = require('../src/config/env');
const logger = require('../src/utils/logger');

// ==============================================================================
// 1. Parser Tipe PostgreSQL (Data Types & Timezone Alignment)
// ==============================================================================
// OID 1082: DATE -> Kembalikan sebagai string murni "YYYY-MM-DD"
// Mencegah konversi otomatis pg ke JavaScript Date yang berisiko menggeser hari karena zona waktu.
types.setTypeParser(1082, (val) => val);

// OID 20: INT8 / BIGINT -> Parse ke integer JavaScript agar tidak bocor sebagai string (e.g. COUNT(*))
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

// ==============================================================================
// 2. Konfigurasi Pool Bersama (Production-Grade)
// ==============================================================================
const connectionString =
  (env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test')
    ? process.env.TEST_DATABASE_URL || env.TEST_DATABASE_URL || 'postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_test'
    : process.env.DATABASE_URL || env.DATABASE_URL || 'postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_dev';

// Safety Guard: Validasi database tes WAJIB berakhiran _test
if (env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test') {
  try {
    const urlObj = new URL(connectionString);
    const dbName = urlObj.pathname.replace(/^\//, '');
    if (!dbName.endsWith('_test')) {
      throw new Error(`[SECURITY FATAL] Lingkungan pengujian (NODE_ENV=test) menolak berjalan karena nama database tidak berakhiran "_test"! Database: "${dbName}"`);
    }
  } catch (err) {
    if (err.message.includes('SECURITY FATAL')) throw err;
    // Fallback if URL parsing fails on weird connection strings
    if (!connectionString.includes('_test')) {
      throw new Error(`[SECURITY FATAL] Lingkungan pengujian (NODE_ENV=test) menolak berjalan karena nama database tidak berakhiran "_test"! Connection string: ${connectionString}`);
    }
  }
}

const isSsl = process.env.DATABASE_SSL === 'true' || env.DATABASE_SSL === true;

const poolConfig = {
  connectionString,
  max: parseInt(process.env.DB_POOL_MAX || env.DB_POOL_MAX || 25, 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || env.DB_STATEMENT_TIMEOUT_MS || 15000, 10),
  application_name: 'rodakita-api',
  // Sesi pool diatur ke UTC agar konsisten secara internal
  options: `-c timezone=UTC -c idle_in_transaction_session_timeout=${parseInt(process.env.DB_IDLE_TX_TIMEOUT_MS || env.DB_IDLE_TX_TIMEOUT_MS || 15000, 10)}`,
  ...(isSsl && {
    ssl: {
      rejectUnauthorized: false,
    },
  }),
};

const pool = new Pool(poolConfig);

// WAJIB pasang pool.on('error') agar error koneksi idle tidak menjatuhkan proses node
pool.on('error', (err) => {
  logger.error('[DB POOL] Error tak terduga pada client idle PostgreSQL (melanjutkan proses):', err.message);
});

/**
 * Helper eksekusi query SQL dengan tracing waktu eksekusi.
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development' && duration > 200) {
      logger.warn(`[SLOW QUERY] ${duration}ms: ${text.slice(0, 100)}...`);
    }
    return res;
  } catch (error) {
    logger.error(`[DB QUERY ERROR] ${error.message} - SQL: ${text.slice(0, 100)}`);
    throw error;
  }
}

/**
 * Inisialisasi koneksi awal dengan retry dan exponential backoff (maks 10 kali).
 * Jika gagal total, proses keluar dengan kode non-nol.
 */
async function initPool(maxRetries = 10) {
  let attempt = 0;
  let delay = 500;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const client = await pool.connect();
      try {
        const res = await client.query(
          "SELECT current_database() AS db_name, (now() AT TIME ZONE 'Asia/Jakarta')::text AS server_time"
        );
        logger.info(
          `[DB] Berhasil terhubung ke PostgreSQL (${res.rows[0].db_name}) pada percobaan ke-${attempt}. Waktu server (WIB): ${res.rows[0].server_time}`
        );
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.warn(
        `[DB] Gagal menghubungkan ke PostgreSQL (percobaan ${attempt}/${maxRetries}): ${err.message}`
      );
      if (attempt >= maxRetries) {
        logger.error(
          `[DB FATAL] Gagal terhubung ke PostgreSQL setelah ${maxRetries} percobaan. Menghentikan aplikasi demi keselamatan sistem.`
        );
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(Math.round(delay * 1.5), 5000);
    }
  }
}

/**
 * Pengecekan koneksi PostgreSQL untuk endpoint /api/health.
 */
async function healthCheck() {
  const start = Date.now();
  try {
    const res = await pool.query(
      "SELECT 1 AS alive, current_database() AS db_name, (now() AT TIME ZONE 'Asia/Jakarta')::text AS server_time"
    );
    return {
      status: 'UP',
      database: res.rows[0].db_name,
      latencyMs: Date.now() - start,
      serverTime: res.rows[0].server_time,
    };
  } catch (err) {
    return {
      status: 'DOWN',
      error: err.message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Menutup seluruh koneksi pool saat graceful shutdown.
 */
async function close() {
  try {
    await pool.end();
    logger.info('[DB POOL] Seluruh koneksi pool PostgreSQL berhasil ditutup secara bersih.');
  } catch (err) {
    logger.error('[DB POOL] Gagal menutup pool PostgreSQL:', err.message);
  }
}

module.exports = {
  pool,
  query,
  initPool,
  healthCheck,
  close,
};
