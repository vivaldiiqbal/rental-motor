const express = require('express');
const router = express.Router();
const documentReviewController = require('../../controllers/admin/documentReviewController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Dokumen: Staff & Admin
router.use(requireRole('admin', 'staff'));

router.get('/', asyncHandler(documentReviewController.getDocuments));
router.get('/:userId/:type/file', asyncHandler(documentReviewController.getDocumentFile));
router.post('/:userId/:type/verify', asyncHandler(documentReviewController.verifyDocument));

module.exports = router;
