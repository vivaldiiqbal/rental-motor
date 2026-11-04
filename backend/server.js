const env = require('./src/config/env');

// 1. Validasi Environment sebelum modul lain berjalan
env.validateEnv();

const app = require('./src/app');
const logger = require('./src/utils/logger');
const { store } = require('./src/repositories');
const { startJobs, stopJobs } = require('./src/jobs');
const { close: closePool, healthCheck } = require('./db/pool');

// 2. Inisialisasi awal database
if (env.USE_DB === 'memory') {
  store.init();
} else if (env.USE_DB === 'postgres') {
  const { initPool } = require('./db/pool');
  initPool()
    .then(async () => {
      const { ensureAdminAccount } = require('./src/utils/ensureAdmin');
      await ensureAdminAccount();
    })
    .catch((err) => {
      logger.error('[FATAL] Inisialisasi pool database gagal:', err);
      process.exit(1);
    });
}

// 3. Jalankan background scheduler cron
startJobs();

// 4. Jalankan server HTTP
const server = app.listen(env.PORT, () => {
  logger.info(`=======================================================`);
  logger.info(`  RodaKita Motor Rental Backend Server Berjalan!`);
  logger.info(`  Port        : ${env.PORT}`);
  logger.info(`  Environment : ${env.NODE_ENV}`);
  logger.info(`  Storage DB  : ${env.USE_DB}`);
  logger.info(`  Health Check: http://localhost:${env.PORT}/api/health`);
  logger.info(`=======================================================`);
});

// 5. Penanganan Graceful Shutdown (Bebas Crash)
let isShuttingDown = false;

function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Menerima sinyal ${signal}. Menutup server secara graceful...`);

  // Hentikan scheduler cron
  stopJobs();

  // Berhenti menerima request HTTP baru dan selesaikan request yang sedang berjalan
  server.close(async () => {
    if (env.USE_DB === 'memory') {
      logger.info('Semua koneksi HTTP selesai. Mempersistenkan database ke data/db.json...');
      store.persistSync();
      logger.info('Database berhasil disimpan. Proses backend keluar dengan bersih.');
    } else if (env.USE_DB === 'postgres') {
      logger.info('Menutup pool koneksi PostgreSQL...');
      await closePool();
    }
    process.exit(0);
  });

  // Timeout penghentian paksa jika ada request yang menggantung > 10 detik
  setTimeout(() => {
    logger.error('Penutupan server melebihi batas waktu 10 detik. Memaksa keluar.');
    if (env.USE_DB === 'memory') {
      store.persistSync();
    }
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('CRITICAL UNCAUGHT EXCEPTION:', err);
  handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('CRITICAL UNHANDLED REJECTION:', reason);
  handleShutdown('unhandledRejection');
});
