const express = require('express');
const router = express.Router();
const reviewModerationController = require('../../controllers/admin/reviewModerationController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Moderasi Ulasan: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(reviewModerationController.getReviews));
router.patch('/:id/visibility', asyncHandler(reviewModerationController.setVisibility));
router.patch('/:id/status', asyncHandler(reviewModerationController.setVisibility));

module.exports = router;
