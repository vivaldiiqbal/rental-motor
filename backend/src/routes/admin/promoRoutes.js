const express = require('express');
const router = express.Router();
const promoController = require('../../controllers/admin/promoController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Promo: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(promoController.getPromos));
router.post('/', asyncHandler(promoController.createPromo));
router.get('/:id', asyncHandler(promoController.getPromoById));
router.put('/:id', asyncHandler(promoController.updatePromo));
router.patch('/:id/active', asyncHandler(promoController.toggleActive));
router.delete('/:id', asyncHandler(promoController.deletePromo));

module.exports = router;
