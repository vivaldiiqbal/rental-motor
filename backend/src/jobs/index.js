const cron = require('node-cron');
const expireBookingsJob = require('./expireBookings');
const autoCompleteBookingsJob = require('./completeReminders');
const { runGpsOfflineCheckJob, runGpsRetentionJob } = require('./gpsJobs');
const logger = require('../utils/logger');

let tasks = [];

function startJobs() {
  if (process.env.NODE_ENV === 'test') {
    return; // Nonaktifkan otomatis saat unit/integration test
  }

  // Jalankan tiap menit: mengecek booking pending yang lewat expiresAt
  const expireTask = cron.schedule('* * * * *', async () => {
    await expireBookingsJob();
  });

  // Jalankan setiap 15 menit: mengecek booking aktif yang telah melewati tanggal kembali
  const completeTask = cron.schedule('*/15 * * * *', async () => {
    await autoCompleteBookingsJob();
  });

  // Jalankan tiap menit: mengecek perangkat GPS offline melebihi ambang batas
  const gpsOfflineTask = cron.schedule('* * * * *', async () => {
    await runGpsOfflineCheckJob();
  });

  // Jalankan setiap hari pukul 03:00 WIB: membersihkan data GPS yang melebihi masa retensi
  const gpsRetentionTask = cron.schedule('0 3 * * *', async () => {
    await runGpsRetentionJob();
  });

  tasks.push(expireTask, completeTask, gpsOfflineTask, gpsRetentionTask);
  logger.info('[CRON] Background scheduler aktif (expireBookings, completeReminders, gpsOffline tiap menit, gpsRetention harian).');
}

function stopJobs() {
  tasks.forEach((t) => t.stop());
  tasks = [];
}

module.exports = {
  startJobs,
  stopJobs,
  runGpsRetentionJob,
  runGpsOfflineCheckJob,
};
