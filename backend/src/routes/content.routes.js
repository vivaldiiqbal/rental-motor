const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const asyncHandler = require('../middleware/asyncHandler');

// Konten publik (tanpa autentikasi): halaman, FAQ, content block.
router.get('/pages/:slug', asyncHandler(contentController.getPage));
router.get('/faqs', asyncHandler(contentController.getFaqs));
router.get('/blocks', asyncHandler(contentController.getBlocks));

module.exports = router;
