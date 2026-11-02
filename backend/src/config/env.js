const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5001,
  USE_DB: process.env.USE_DB || 'memory',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173',
  CORS_ORIGIN: process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173',
  JWT_SECRET: process.env.JWT_SECRET || 'rodakita_dev_secret_key_change_in_production_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 2, // 2 MB per file
  UPLOAD_PATH: process.env.UPLOAD_PATH || path.resolve(__dirname, '../../uploads'),
  AUTO_VERIFY_DOCS: process.env.AUTO_VERIFY_DOCS === 'true' || process.env.AUTO_VERIFY_DOCS === true,
  REQUIRE_VERIFIED_DOCS: process.env.REQUIRE_VERIFIED_DOCS === 'true' || process.env.REQUIRE_VERIFIED_DOCS === true,
  WEEKEND_SURCHARGE: process.env.WEEKEND_SURCHARGE === 'true' || process.env.WEEKEND_SURCHARGE === true,
  BOOKING_EXPIRE_MINUTES: parseInt(process.env.BOOKING_EXPIRE_MINUTES, 10) || 60,
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'simulation',
  MIDTRANS_SERVER_KEY: process.env.MIDTRANS_SERVER_KEY || '',
  MIDTRANS_CLIENT_KEY: process.env.MIDTRANS_CLIENT_KEY || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'rodakita_webhook_secret_simulation_2026',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_dev',
  DATABASE_SSL: process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === true,
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  DB_STATEMENT_TIMEOUT_MS: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10) || 15000,
  DB_IDLE_TX_TIMEOUT_MS: parseInt(process.env.DB_IDLE_TX_TIMEOUT_MS, 10) || 15000,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_test',
  NIK_HMAC_SECRET: process.env.NIK_HMAC_SECRET || 'rodakita_nik_secret_hmac_2026_change_in_production',
  GPS_INGEST_SECRET: process.env.GPS_INGEST_SECRET || 'rodakita_gps_secret_shared_key_2026',
  GPS_RETENTION_DAYS: parseInt(process.env.GPS_RETENTION_DAYS, 10) || 90,
};

/**
 * Validasi ketat environment variables saat aplikasi start.
 * Menolak start di production jika JWT_SECRET tidak aman (< 32 karakter).
 */
function validateEnv() {
  const errors = [];

  if (isNaN(env.PORT) || env.PORT <= 0 || env.PORT > 65535) {
    errors.push('PORT harus berupa angka port yang valid (1-65535).');
  }

  if (env.NODE_ENV === 'production') {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET wajib diset minimal 32 karakter pada environment production demi keamanan enkripsi HS256.');
    }
    if (!env.REQUIRE_VERIFIED_DOCS) {
      errors.push('REQUIRE_VERIFIED_DOCS wajib true pada environment production demi kepatuhan dokumen ketat.');
    }
    if (!env.NIK_HMAC_SECRET || env.NIK_HMAC_SECRET.length < 32) {
      errors.push('NIK_HMAC_SECRET wajib diset minimal 32 karakter pada environment production demi keamanan hashing NIK.');
    }
  }

  if (env.BCRYPT_ROUNDS < 10 || env.BCRYPT_ROUNDS > 12) {
    // Diizinkan nilai standar 10-12
    if (env.NODE_ENV === 'production') {
      errors.push('BCRYPT_ROUNDS harus bernilai antara 10 s/d 12.');
    }
  }

  if (errors.length > 0) {
    console.error('=================================================================');
    console.error('[FATAL] VALIDASI ENVIRONMENT GAGAL:');
    errors.forEach((err) => console.error(` - ${err}`));
    console.error('Aplikasi menolak start demi keamanan.');
    console.error('=================================================================');
    process.exit(1);
  }
}

env.validateEnv = validateEnv;

module.exports = env;
