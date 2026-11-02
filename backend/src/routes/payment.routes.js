const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');

// 1. Buat transaksi & instruksi pembayaran
router.post('/create', protect, asyncHandler(paymentController.createPayment));

// 2. Simulasi pembayaran instan (khusus mode simulation)
router.post('/:id/simulate-pay', protect, asyncHandler(paymentController.simulatePay));

// 3. Status pembayaran per booking
router.get('/booking/:bookingId', protect, asyncHandler(paymentController.getPaymentByBooking));
router.get('/:code', protect, asyncHandler(paymentController.getPaymentByBooking));

// 4. Webhook notifikasi pembayaran (tanpa JWT, verifikasi signature)
router.post('/notification', asyncHandler(paymentController.handleNotification));

module.exports = router;
