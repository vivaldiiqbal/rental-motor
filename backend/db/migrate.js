const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./pool');
const logger = require('../src/utils/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const ADVISORY_LOCK_ID = 987654321;

/**
 * Menghitung SHA256 checksum dari konten file migrasi.
 */
function getChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Memastikan tabel schema_migrations tersedia di database.
 */
async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Menjalankan seluruh migrasi yang belum dieksekusi dalam urutan alfabetis.
 */
async function runMigrations(customPool = null) {
  const targetPool = customPool || pool;
  const client = await targetPool.connect();

  try {
    // 1. Dapatkan advisory lock eksklusif untuk mencegah eksekusi migrasi paralel
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    logger.info('[MIGRATION] Berhasil mengunci advisory lock.');

    // 2. Siapkan tabel pelacak migrasi
    await ensureMigrationTable(client);

    // 3. Ambil daftar migrasi yang sudah dieksekusi
    const executedRes = await client.query('SELECT name, checksum FROM schema_migrations ORDER BY id ASC');
    const executedMap = new Map(executedRes.rows.map((r) => [r.name, r.checksum]));

    // 4. Baca semua file .sql dari folder migrations
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let executedCount = 0;

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const currentChecksum = getChecksum(sqlContent);

      if (executedMap.has(file)) {
        const storedChecksum = executedMap.get(file);
        if (storedChecksum !== currentChecksum) {
          throw new Error(
            `[MIGRATION ERROR] Checksum mismatch pada '${file}'! File migrasi yang telah dijalankan tidak boleh dimodifikasi. (Tersimpan: ${storedChecksum.slice(0, 8)}, Sekarang: ${currentChecksum.slice(0, 8)})`,
          );
        }
        continue;
      }

      // Jalankan migrasi baru dalam transaksi atomik
      logger.info(`[MIGRATION] Menjalankan migrasi: ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [file, currentChecksum],
        );
        await client.query('COMMIT');
        executedCount++;
        logger.info(`[MIGRATION] Berhasil: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`[MIGRATION ERROR] Gagal mengeksekusi ${file}:`, err.message);
        throw err;
      }
    }

    if (executedCount === 0) {
      logger.info('[MIGRATION] Database sudah mutakhir (tidak ada migrasi baru).');
    } else {
      logger.info(`[MIGRATION] Selesai: ${executedCount} migrasi baru berhasil diterapkan.`);
    }

    return { success: true, count: executedCount };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (e) {
      /* ignore */
    }
    client.release();
  }
}

/**
 * Menampilkan status migrasi yang telah dan belum dieksekusi.
 */
async function statusMigrations() {
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const executedRes = await client.query('SELECT name, checksum, applied_at FROM schema_migrations ORDER BY id ASC');
    const executedMap = new Map(executedRes.rows.map((r) => [r.name, r]));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log('\n=== STATUS MIGRASI POSTGRESQL ===');
    console.log('--------------------------------------------------------------------------------');
    console.log('Status        File Migrasi                      Diterapkan Pada');
    console.log('--------------------------------------------------------------------------------');

    for (const file of files) {
      if (executedMap.has(file)) {
        const item = executedMap.get(file);
        console.log(`[TERAPKAN]    ${file.padEnd(32)}  ${new Date(item.applied_at).toLocaleString()}`);
      } else {
        console.log(`[TERTUNDA]    ${file.padEnd(32)}  -`);
      }
    }
    console.log('--------------------------------------------------------------------------------\n');
  } finally {
    client.release();
  }
}

// Eksekusi via CLI
if (require.main === module) {
  const cmd = process.argv[2] || 'up';
  if (cmd === 'status') {
    statusMigrations()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else {
    runMigrations()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
}

module.exports = {
  runMigrations,
  statusMigrations,
};
