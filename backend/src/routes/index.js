const express = require('express');
const router = express.Router();

const healthController = require('../controllers/healthController');
const authRoutes = require('./auth.routes');
const motorRoutes = require('./motor.routes');
const metaRoutes = require('./meta.routes');
const bookingRoutes = require('./booking.routes');
const paymentRoutes = require('./payment.routes');
const reviewRoutes = require('./review.routes');
const favoriteRoutes = require('./favorite.routes');
const promoRoutes = require('./promo.routes');
const contactRoutes = require('./contact.routes');
const contentRoutes = require('./content.routes');

// 1. Health Check
router.get('/health', healthController.check);

// 2. Auth Modul
router.use('/auth', authRoutes);

// 3. Motorcycles Modul (/motorcycles dan alias /motors)
router.use('/motorcycles', motorRoutes);
router.use('/motors', motorRoutes);

// 4. Meta Rental Options
router.use('/meta', metaRoutes);

// 5. Booking Modul
router.use('/bookings', bookingRoutes);

// 6. Payment Modul
router.use('/payments', paymentRoutes);

// 7. Review Modul
router.use('/reviews', reviewRoutes);

// 8. Favorite Modul
router.use('/favorites', favoriteRoutes);

// 9. Promo Modul (/promo dan alias /promos)
router.use('/promo', promoRoutes);
router.use('/promos', promoRoutes);

// 10. Contact Modul
router.use('/contact', contactRoutes);

// 10b. Konten dinamis publik (halaman, FAQ, content block)
router.use('/content', contentRoutes);

// 10c. Realtime Server-Sent Events (SSE) & Ticketing
const eventRoutes = require('./event.routes');
router.use('/events', eventRoutes);

// 10d. GPS Tracking & Ingest Modul
const gpsRoutes = require('./gps.routes');
router.use('/gps', gpsRoutes);

// 11. Admin Modul (/admin/*)
const adminRoutes = require('./admin');
router.use('/admin', adminRoutes);

// 12. Pendukung pengujian: HANYA terpasang saat NODE_ENV=test (mustahil aktif di production)
if (process.env.NODE_ENV === 'test') {
  router.use('/__test', require('./testSupport.routes'));
}

module.exports = router;
