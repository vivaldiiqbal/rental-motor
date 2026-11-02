const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/admin/dashboardController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Staff and Admin can view dashboard KPIs and tasks
router.use(requireRole('admin', 'staff'));

router.get('/summary', asyncHandler(dashboardController.getSummary));
router.get('/revenue', asyncHandler(dashboardController.getRevenue));
router.get('/tasks', asyncHandler(dashboardController.getTasks));

module.exports = router;
