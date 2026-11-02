const express = require('express');
const router = express.Router();
const messageController = require('../../controllers/admin/messageController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Pesan Kontak: Staff & Admin
router.use(requireRole('admin', 'staff'));

router.get('/', asyncHandler(messageController.getMessages));
router.patch('/:id/read', asyncHandler(messageController.markRead));
router.post('/:id/reply', asyncHandler(messageController.replyMessage));
router.patch('/:id/reply', asyncHandler(messageController.replyMessage));

module.exports = router;
