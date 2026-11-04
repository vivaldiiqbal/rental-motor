const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { bookingCreationLimiter } = require('../middleware/rateLimiters');
const {
  quoteSchema,
  createBookingSchema,
  cancelBookingSchema,
} = require('../validators/bookingValidator');

// 1. Kalkulasi penawaran harga tanpa menyimpan
router.post('/quote', validate(quoteSchema), asyncHandler(bookingController.quote));

// 2. Buat pemesanan baru (dengan rate limiter 20/jam per user)
router.post('/', protect, bookingCreationLimiter, validate(createBookingSchema), asyncHandler(bookingController.createBooking));

// 3. Daftar pemesanan saya (dengan counts per status)
router.get('/my', protect, asyncHandler(bookingController.getMyBookings));
router.get('/', protect, asyncHandler(bookingController.getMyBookings));

// 4. Unduh berkas kalender .ics
router.get('/:id/ics', protect, asyncHandler(bookingController.getBookingIcs));

// 5. Batalkan pemesanan
router.put('/:id/cancel', protect, validate(cancelBookingSchema), asyncHandler(bookingController.cancelBooking));
router.post('/:id/cancel', protect, validate(cancelBookingSchema), asyncHandler(bookingController.cancelBooking));

// 5b. Ajukan pengembalian motor oleh pelanggan (active -> return_requested)
router.post('/:id/request-return', protect, asyncHandler(bookingController.requestReturn));

// 6. Detail pemesanan (hanya pemilik, selain pemilik -> 404)
router.get('/:id', protect, asyncHandler(bookingController.getBookingDetail));

module.exports = router;
