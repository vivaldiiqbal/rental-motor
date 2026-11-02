const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/rental-options', asyncHandler(metaController.getRentalOptions));
router.get('/site', asyncHandler(metaController.getSiteMeta));

module.exports = router;
