const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { sensitiveFormLimiter } = require('../middleware/rateLimiters');
const { contactSchema } = require('../validators/contactValidator');

router.post('/', sensitiveFormLimiter, validate(contactSchema), asyncHandler(contactController.sendMessage));

module.exports = router;
