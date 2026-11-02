const express = require('express');
const router = express.Router();

const { protect } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { adminLimiter } = require('../../middleware/rateLimiters');

// Sub-modul admin
const dashboardRoutes = require('./dashboardRoutes');
const bookingRoutes = require('./bookingRoutes');
const documentRoutes = require('./documentRoutes');
const motorcycleRoutes = require('./motorcycleRoutes');
const calendarRoutes = require('./calendarRoutes');
const maintenanceRoutes = require('./maintenanceRoutes');
const userRoutes = require('./userRoutes');
const reviewRoutes = require('./reviewRoutes');
const promoRoutes = require('./promoRoutes');
const addonRoutes = require('./addonRoutes');
const locationRoutes = require('./locationRoutes');
const settingsRoutes = require('./settingsRoutes');
const messageRoutes = require('./messageRoutes');
const reportRoutes = require('./reportRoutes');
const auditRoutes = require('./auditRoutes');
const contentRoutes = require('./contentRoutes');
const pricingRoutes = require('./pricingRoutes');
const gpsRoutes = require('./gpsRoutes');

// Seluruh endpoint /api/admin/* wajib:
// 1. protect (JWT valid)
// 2. adminLimiter (maks 600 request / 15 menit)
// 3. requireRole (minimal staff atau admin, dicek ke storage pada setiap request)
router.use(protect);
router.use(adminLimiter);
router.use(requireRole('admin', 'staff'));

router.use('/dashboard', dashboardRoutes);
router.use('/bookings', bookingRoutes);
router.use('/documents', documentRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/calendar', calendarRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/users', userRoutes);
router.use('/reviews', reviewRoutes);
router.use('/promos', promoRoutes);
router.use('/addons', addonRoutes);
router.use('/locations', locationRoutes);
router.use('/settings', settingsRoutes);
router.use('/contact-messages', messageRoutes);
router.use('/messages', messageRoutes);
router.use('/reports', reportRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/audit', auditRoutes);
router.use('/gps', gpsRoutes); // /live, /motorcycles/:id/positions, /alerts, /devices, /geofences, /settings
router.use('/', contentRoutes); // /pages, /faqs, /content-blocks (admin saja)
router.use('/', pricingRoutes); // /pricing-rules, /discount-tiers (admin saja)

module.exports = router;
