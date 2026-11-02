const { store } = require('../repositories');
const { BOOKING_STATUS } = require('../config/constants');
const { toISODate } = require('../utils/dates');
const logger = require('../utils/logger');

let isRunning = false;

/**
 * Job untuk menandai booking berstatus 'active' yang sudah melewati tanggal kembali sebagai 'completed'.
 * Dilengkapi flag isRunning untuk mencegah eksekusi bertumpuk.
 */
async function autoCompleteBookingsJob() {
  if (isRunning) {
    logger.debug('[CRON] autoCompleteBookingsJob dilewati karena iterasi sebelumnya masih berjalan.');
    return;
  }

  isRunning = true;
  try {
    const today = toISODate(new Date());

    await store.withLock(async (data) => {
      let count = 0;
      data.bookings.forEach((b) => {
        if (b.status === BOOKING_STATUS.ACTIVE && b.endDate < today) {
          b.status = BOOKING_STATUS.COMPLETED;
          b.completedAt = new Date().toISOString();

          if (!Array.isArray(b.timeline)) b.timeline = [];
          b.timeline.push({
            status: BOOKING_STATUS.COMPLETED,
            at: b.completedAt,
            note: 'Sewa selesai otomatis karena telah melewati tanggal kembali.',
          });

          count++;
        }
      });

      if (count > 0) {
        logger.info(`[CRON] ${count} booking aktif yang melewati tanggal kembali otomatis ditandai 'completed'.`);
      }
    });
  } catch (err) {
    logger.error('[CRON] Gagal menjalankan autoCompleteBookingsJob:', err);
  } finally {
    isRunning = false;
  }
}

module.exports = autoCompleteBookingsJob;
