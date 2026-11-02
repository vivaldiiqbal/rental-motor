const express = require('express');
const router = express.Router();
const gpsController = require('../controllers/gpsController');

// Endpoint Ingest Posisi GPS (terbuka untuk vendor / simulator dengan autentikasi HMAC / Secret)
// Mendukung /api/gps/ingest/:provider dan /api/gps/ingest
router.post('/ingest/:provider', gpsController.ingest);
router.post('/ingest', gpsController.ingest);

module.exports = router;
