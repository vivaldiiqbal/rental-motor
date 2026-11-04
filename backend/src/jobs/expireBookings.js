const logger = require('../utils/logger');

/**
 * Job untuk membatalkan booking berstatus 'pending' yang melewati batas waktu expiresAt.
 * (Sistem kedaluwarsa otomatis dinonaktifkan: pesanan tetap menunggu tindakan Admin).
 */
async function expireBookingsJob() {
  logger.debug('[CRON] expireBookingsJob dilewati karena auto-expiry telah dinonaktifkan.');
  return { expiredCount: 0 };
}

module.exports = expireBookingsJob;
