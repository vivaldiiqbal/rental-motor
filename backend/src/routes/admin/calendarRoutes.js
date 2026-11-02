const express = require('express');
const router = express.Router();
const calendarController = require('../../controllers/admin/calendarController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Kalender: Staff & Admin
router.use(requireRole('admin', 'staff'));

router.get('/', asyncHandler(calendarController.getCalendar));

module.exports = router;
