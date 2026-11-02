const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/admin/settingsController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Pengaturan Global: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(settingsController.getSettings));
router.put('/', asyncHandler(settingsController.updateSettings));
router.post('/reset', asyncHandler(settingsController.resetSettings));

module.exports = router;
