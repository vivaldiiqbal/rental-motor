const express = require('express');
const router = express.Router();
const gpsAdminController = require('../../controllers/admin/gpsAdminController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// ========================================================
// 1. ENDPOINT OPERASIONAL (STAFF & ADMIN)
// ========================================================
// GET /live: Peta & panel pemantauan seluruh armada
router.get('/live', asyncHandler(gpsAdminController.getLive));

// GET /motorcycles/:id/positions: Riwayat rute (Staf maks 7 hari, Admin 90 hari)
router.get('/motorcycles/:id/positions', asyncHandler(gpsAdminController.getMotorcyclePositions));

// Alert management (Staf & Admin)
router.get('/alerts', asyncHandler(gpsAdminController.listAlerts));
router.patch('/alerts/:id/acknowledge', asyncHandler(gpsAdminController.acknowledgeAlert));
router.patch('/alerts/:id/resolve', asyncHandler(gpsAdminController.resolveAlert));

// ========================================================
// 2. ENDPOINT PENGELOLAAN KHUSUS ADMIN (REQUIRE ROLE ADMIN)
// ========================================================
router.use(requireRole('admin'));

// Manajemen Perangkat GPS
router.get('/devices', asyncHandler(gpsAdminController.listDevices));
router.post('/devices', asyncHandler(gpsAdminController.createDevice));
router.put('/devices/:id', asyncHandler(gpsAdminController.updateDevice));
router.post('/devices/:id/replace', asyncHandler(gpsAdminController.replaceDevice));

// Manajemen Geofence
router.get('/geofences', asyncHandler(gpsAdminController.listGeofences));
router.post('/geofences', asyncHandler(gpsAdminController.createGeofence));
router.put('/geofences/:id', asyncHandler(gpsAdminController.updateGeofence));
router.delete('/geofences/:id', asyncHandler(gpsAdminController.deleteGeofence));

// Pengaturan GPS & Log Audit Akses
router.get('/settings', asyncHandler(gpsAdminController.getSettings));
router.put('/settings', asyncHandler(gpsAdminController.updateSettings));
router.get('/access-log', asyncHandler(gpsAdminController.getAccessLogs));

module.exports = router;
