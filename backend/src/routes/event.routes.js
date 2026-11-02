const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');

// 1. Minta tiket sekali-pakai (wajib login dengan JWT)
router.post('/ticket', protect, asyncHandler(eventController.createTicket));

// 2. Stream Server-Sent Events (SSE) menggunakan tiket sekali-pakai
router.get('/', asyncHandler(eventController.streamEvents));

module.exports = router;
