const express = require('express');
const router = express.Router();
const reportController = require('../../controllers/admin/reportController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');
const { exportLimiter } = require('../../middleware/rateLimiters');

// Laporan Keuangan & Okupansi: Khusus Admin
router.use(requireRole('admin'));

// Middleware pembatas khusus format CSV
function applyExportLimiterIfCsv(req, res, next) {
  if (req.query.format === 'csv') {
    return exportLimiter(req, res, next);
  }
  next();
}

router.get('/revenue', applyExportLimiterIfCsv, asyncHandler(reportController.getRevenueReport));
router.get('/utilization', applyExportLimiterIfCsv, asyncHandler(reportController.getUtilizationReport));
router.get('/top-motors', applyExportLimiterIfCsv, asyncHandler(reportController.getTopMotorsReport));
router.get('/bookings-summary', applyExportLimiterIfCsv, asyncHandler(reportController.getBookingsSummaryReport));

module.exports = router;
