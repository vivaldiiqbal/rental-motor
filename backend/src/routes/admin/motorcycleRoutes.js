const express = require('express');
const router = express.Router();
const adminMotorController = require('../../controllers/admin/adminMotorController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');
const { uploadMotorImagesMiddleware } = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/rateLimiters');

// Staff & Admin: View
router.get('/filters', requireRole('admin', 'staff'), asyncHandler(adminMotorController.getFilterOptions));
router.get('/', requireRole('admin', 'staff'), asyncHandler(adminMotorController.getMotorcycles));
router.get('/:id', requireRole('admin', 'staff'), asyncHandler(adminMotorController.getMotorcycleById));

// Admin ONLY: Mutasi Armada Motor
router.use(requireRole('admin'));

router.post(
  '/upload-image',
  uploadLimiter,
  uploadMotorImagesMiddleware(),
  asyncHandler(adminMotorController.uploadSingleImage)
);
router.post('/', asyncHandler(adminMotorController.createMotorcycle));
router.put('/:id', asyncHandler(adminMotorController.updateMotorcycle));
router.delete('/:id', asyncHandler(adminMotorController.deleteMotorcycle));
router.patch('/:id/status', asyncHandler(adminMotorController.updateStatus));
router.post(
  '/:id/images',
  uploadLimiter,
  uploadMotorImagesMiddleware(),
  asyncHandler(adminMotorController.addImages)
);
router.put('/:id/images/order', asyncHandler(adminMotorController.reorderImages));
router.delete('/:id/images/:imageId', asyncHandler(adminMotorController.deleteImage));

module.exports = router;
