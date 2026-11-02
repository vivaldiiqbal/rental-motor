const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/pricingAdminController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Pengelolaan aturan harga & tier diskon: Khusus Admin (staff ditolak 403 FORBIDDEN_ROLE)
router.use(['/pricing-rules', '/discount-tiers'], requireRole('admin'));

// Pricing Rules
router.get('/pricing-rules', asyncHandler(c.listPricingRules));
router.post('/pricing-rules', asyncHandler(c.createPricingRule));
router.get('/pricing-rules/:id', asyncHandler(c.getPricingRule));
router.put('/pricing-rules/:id', asyncHandler(c.updatePricingRule));
router.delete('/pricing-rules/:id', asyncHandler(c.deletePricingRule));

// Discount Tiers
router.get('/discount-tiers', asyncHandler(c.listDiscountTiers));
router.post('/discount-tiers', asyncHandler(c.createDiscountTier));
router.get('/discount-tiers/:id', asyncHandler(c.getDiscountTier));
router.put('/discount-tiers/:id', asyncHandler(c.updateDiscountTier));
router.delete('/discount-tiers/:id', asyncHandler(c.deleteDiscountTier));

module.exports = router;
