const express = require('express');
const router = express.Router();
const addonController = require('../../controllers/admin/addonController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Addon: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(addonController.getAddons));
router.post('/', asyncHandler(addonController.createAddon));
router.get('/:id', asyncHandler(addonController.getAddonById));
router.put('/:id', asyncHandler(addonController.updateAddon));
router.patch('/:id/active', asyncHandler(addonController.toggleActive));
router.delete('/:id', asyncHandler(addonController.deleteAddon));

module.exports = router;
