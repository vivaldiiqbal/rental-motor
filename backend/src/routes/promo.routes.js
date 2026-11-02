const express = require('express');
const router = express.Router();
const promoController = require('../controllers/promoController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { validatePromoSchema } = require('../validators/promoValidator');

router.get('/', asyncHandler(promoController.getActivePromos));
router.post('/validate', validate(validatePromoSchema), asyncHandler(promoController.validatePromo));

module.exports = router;
