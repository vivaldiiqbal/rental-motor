const express = require('express');
const router = express.Router();
const locationController = require('../../controllers/admin/locationController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Lokasi Antar-Jemput: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(locationController.getLocations));
router.post('/', asyncHandler(locationController.createLocation));
router.get('/:id', asyncHandler(locationController.getLocationById));
router.put('/:id', asyncHandler(locationController.updateLocation));
router.patch('/:id/active', asyncHandler(locationController.toggleActive));
router.delete('/:id', asyncHandler(locationController.deleteLocation));

module.exports = router;
