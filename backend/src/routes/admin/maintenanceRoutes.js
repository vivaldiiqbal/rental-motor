const express = require('express');
const router = express.Router();
const maintenanceController = require('../../controllers/admin/maintenanceController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Perawatan / Servis: Staff & Admin
router.use(requireRole('admin', 'staff'));

router.get('/', asyncHandler(maintenanceController.getMaintenance));
router.post('/', asyncHandler(maintenanceController.createMaintenance));
router.get('/:id', asyncHandler(maintenanceController.getMaintenanceById));
router.put('/:id', asyncHandler(maintenanceController.updateMaintenance));
router.post('/:id/complete', asyncHandler(maintenanceController.completeMaintenance));
router.patch('/:id/complete', asyncHandler(maintenanceController.completeMaintenance));
router.delete('/:id', asyncHandler(maintenanceController.deleteMaintenance));

module.exports = router;
