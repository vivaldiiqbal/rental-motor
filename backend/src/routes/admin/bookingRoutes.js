const express = require('express');
const router = express.Router();
const adminBookingController = require('../../controllers/admin/adminBookingController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');
const { exportLimiter } = require('../../middleware/rateLimiters');

// Ekspor CSV: Khusus Admin + Rate Limiting ketat
router.get(
  '/export.csv',
  requireRole('admin'),
  exportLimiter,
  asyncHandler(adminBookingController.exportCsv)
);

// Pembatalan Booking: Khusus Admin
router.post(
  '/:id/cancel',
  requireRole('admin'),
  asyncHandler(adminBookingController.cancelBooking)
);

// Operasional: Staff & Admin
router.use(requireRole('admin', 'staff'));

router.get('/', asyncHandler(adminBookingController.getBookings));
router.get('/:id', asyncHandler(adminBookingController.getBookingById));
router.post('/:id/approve-handover', asyncHandler(adminBookingController.approveAndHandover));
router.post('/:id/reject', asyncHandler(adminBookingController.rejectBooking));
router.post('/:id/complete-return', asyncHandler(adminBookingController.completeReturn));
router.post('/:id/confirm-manual-payment', asyncHandler(adminBookingController.confirmManualPayment));
router.post('/:id/handover', asyncHandler(adminBookingController.handover));
router.post('/:id/return', asyncHandler(adminBookingController.returnMotor));
router.post('/:id/notes', asyncHandler(adminBookingController.addNote));
router.post('/:id/deposit-refunded', asyncHandler(adminBookingController.markDepositRefunded));

module.exports = router;
