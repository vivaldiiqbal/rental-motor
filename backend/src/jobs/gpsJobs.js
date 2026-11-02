const { gpsRepo, settingsRepo } = require('../repositories');
const gpsAlertService = require('../services/gps/gpsAlertService');
const logger = require('../utils/logger');
const env = require('../config/env');

let isRetentionRunning = false;

/**
 * Pembersih Retensi GPS (Tahap 1 Item 6):
 * Hapus posisi lebih tua dari gps.retention_days dalam batch kecil (500) agar tidak mengunci tabel.
 * Simpan alert lebih lama (1 tahun = 365 hari).
 * Mencegah eksekusi ganda menggunakan advisory lock pada PostgreSQL atau flag memori.
 */
async function runGpsRetentionJob() {
  if (isRetentionRunning) {
    logger.info('[GPS RETENTION] Job sedang berjalan, lewati eksekusi ganda.');
    return;
  }

  isRetentionRunning = true;
  let client = null;
  let hasLock = false;

  try {
    // 1. Dapatkan Advisory Lock jika menggunakan PostgreSQL
    if (env.USE_DB === 'postgres') {
      const { pool } = require('../../db/pool');
      client = await pool.connect();
      const lockRes = await client.query('SELECT pg_try_advisory_lock(749201) AS locked');
      hasLock = lockRes.rows[0]?.locked;
      if (!hasLock) {
        logger.info('[GPS RETENTION] Advisory lock tidak didapatkan (proses lain sedang berjalan).');
        return;
      }
    }

    const settings = await settingsRepo.getSettings();
    const retentionDays = Number(settings['gps.retention_days'] || 90);
    const now = Date.now();

    // Ambang batas posisi
    const cutoffPositions = new Date(now - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    // Ambang batas alert (1 tahun = 365 hari)
    const cutoffAlerts = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();

    logger.info(`[GPS RETENTION] Memulai pembersihan data: posisi < ${retentionDays} hari, alerts < 365 hari...`);

    // Hapus posisi dalam batch kecil (maksimal 500 per batch) sampai habis
    let totalPositionsDeleted = 0;
    const batchSize = 500;
    while (true) {
      const deleted = await gpsRepo.deletePositionsOlderThanBatch(cutoffPositions, batchSize, client);
      totalPositionsDeleted += deleted;
      if (deleted < batchSize) break; // Tidak ada data tersisa
    }

    // Hapus alert lama > 1 tahun
    const totalAlertsDeleted = await gpsRepo.deleteAlertsOlderThan(cutoffAlerts, client);

    logger.info(`[GPS RETENTION] Pembersihan selesai. Terhapus: ${totalPositionsDeleted} posisi, ${totalAlertsDeleted} alerts.`);
    return { positionsDeleted: totalPositionsDeleted, alertsDeleted: totalAlertsDeleted };
  } catch (err) {
    logger.error(`[GPS RETENTION] Terjadi error saat pembersihan retensi: ${err.message}`);
  } finally {
    if (client && hasLock) {
      try {
        await client.query('SELECT pg_advisory_unlock(749201)');
      } catch (unlockErr) {
        logger.warn('[GPS RETENTION] Gagal melepas advisory lock:', unlockErr.message);
      }
      client.release();
    }
    isRetentionRunning = false;
  }
}

/**
 * Pemeriksaan Perangkat Offline (Tahap 2 Item 4):
 * Dijalankan tiap menit untuk mendeteksi perangkat aktif yang tidak mengirim data melebihi gps.offline_minutes.
 */
async function runGpsOfflineCheckJob() {
  try {
    await gpsAlertService.checkOfflineDevices();
  } catch (err) {
    logger.error(`[GPS OFFLINE JOB] Error: ${err.message}`);
  }
}

module.exports = {
  runGpsRetentionJob,
  runGpsOfflineCheckJob,
};
