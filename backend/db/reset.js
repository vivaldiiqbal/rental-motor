const { pool } = require('./pool');
const { runMigrations } = require('./migrate');
const { loadSeed } = require('./seeds/loadSeed');
const logger = require('../src/utils/logger');

/**
 * Reset database:
 * - Hanya boleh dijalankan pada NODE_ENV selain 'production'
 * - Hanya boleh dijalankan pada database yang namanya berakhiran '_dev' atau '_test'
 * - DROP SCHEMA public CASCADE lalu migrate dan seed
 *
 * @param {Pool} customPool - Instance Pool opsional
 */
async function resetDatabase(customPool = null) {
  // 1. Validasi NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    throw new Error("[RESET FORBIDDEN] Reset database dilarang keras di lingkungan production (NODE_ENV=production)!");
  }

  const targetPool = customPool || pool;
  const client = await targetPool.connect();

  try {
    // 2. Validasi nama database (wajib berakhiran _dev atau _test)
    const dbRes = await client.query('SELECT current_database() AS dbname');
    const dbName = dbRes.rows[0]?.dbname || '';

    if (!dbName.endsWith('_dev') && !dbName.endsWith('_test')) {
      throw new Error(
        `[RESET FORBIDDEN] Reset database ditolak! Operasi hanya diizinkan pada database dengan nama berakhiran '_dev' atau '_test' (database saat ini: '${dbName}').`,
      );
    }

    logger.warn(`[RESET] Mereset seluruh skema database PostgreSQL '${dbName}'...`);
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    logger.info(`[RESET] Skema public pada database '${dbName}' berhasil di-drop dan dibuat ulang.`);
  } finally {
    client.release();
  }

  // 3. Jalankan migrasi dari awal
  await runMigrations(targetPool);

  // 4. Muat data seed
  await loadSeed(targetPool);

  logger.info('[RESET] Database PostgreSQL berhasil di-reset dan diisi ulang dari seed.');
  return { success: true };
}

if (require.main === module) {
  resetDatabase()
    .then(() => {
      console.log('Reset database selesai.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = {
  resetDatabase,
};
