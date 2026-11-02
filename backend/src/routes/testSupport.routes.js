/**
 * Route pendukung pengujian (E2E). HANYA aktif bila NODE_ENV === 'test'.
 *
 * Lapisan pengaman:
 *  1. routes/index.js hanya mendaftarkan router ini saat NODE_ENV === 'test'.
 *  2. Setiap request diperiksa ulang di middleware di bawah (404 bila bukan test).
 *  3. clock.setSystemTime() melempar error di luar NODE_ENV=test.
 */
const express = require('express');
const clock = require('../utils/clock');
const asyncHandler = require('../middleware/asyncHandler');
const { successResponse } = require('../utils/response');

const router = express.Router();

router.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rute tidak ditemukan.' } });
  }
  return next();
});

// Atur / reset jam terkendali. Body: { iso: '2026-11-01T09:00:00+07:00' } atau { iso: null } untuk reset.
router.post('/clock', (req, res) => {
  const { iso } = req.body || {};
  clock.setSystemTime(iso || null);
  return successResponse(res, { data: { now: clock.nowIso(), mocked: !!iso } });
});

// Jalankan job kedaluwarsa booking sekarang juga (mengikuti jam terkendali).
router.post('/expire-run', asyncHandler(async (req, res) => {
  const expireBookingsJob = require('../jobs/expireBookings');
  await expireBookingsJob();
  return successResponse(res, { data: { ranAt: clock.nowIso() } });
}));

// Muat ulang data seed dasar (14 motor + akun demo) agar tiap berkas E2E mulai dari keadaan sama.
router.post('/reseed', asyncHandler(async (req, res) => {
  clock.setSystemTime(null);
  const { loadSeed } = require('../../db/seeds/loadSeed');
  await loadSeed();
  return successResponse(res, { data: { reseeded: true } });
}));

module.exports = router;
