const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');

router.get('/', protect, asyncHandler(favoriteController.getFavorites));
router.post('/sync', protect, asyncHandler(favoriteController.syncFavorites));
router.post('/:motorId', protect, asyncHandler(favoriteController.addFavorite));
router.delete('/:motorId', protect, asyncHandler(favoriteController.removeFavorite));

module.exports = router;
