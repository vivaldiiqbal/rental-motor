const express = require('express');
const router = express.Router();
const motorController = require('../controllers/motorController');
const asyncHandler = require('../middleware/asyncHandler');
const { optionalAuth } = require('../middleware/auth');

// 1. Katalog publik dengan filter query
router.get('/', optionalAuth, asyncHandler(motorController.getMotorcycles));

// 2. Motor rekomendasi / featured
router.get('/featured', optionalAuth, asyncHandler(motorController.getFeatured));

// 3. Metadata filter
router.get('/filters', asyncHandler(motorController.getFilters));

// 4. Unavailable dates
router.get('/:id/unavailable-dates', asyncHandler(motorController.getUnavailableDates));

// 5. Cek ketersediaan dan tanggal tersedia terdekat
router.get('/:id/availability', asyncHandler(motorController.getAvailability));

// 6. Ulasan motor + ringkasan distribusi
router.get('/:id/reviews', asyncHandler(motorController.getReviews));

// 7. Motor serupa
router.get('/:id/similar', asyncHandler(motorController.getSimilar));

// 8. Detail motor berdasarkan ID atau Slug
router.get('/:idOrSlug', optionalAuth, asyncHandler(motorController.getMotorDetail));

module.exports = router;
