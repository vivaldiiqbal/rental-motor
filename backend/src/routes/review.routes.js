const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { addReviewSchema } = require('../validators/reviewValidator');

router.get('/motor/:motorId', asyncHandler(reviewController.getMotorReviews));
router.post('/', protect, validate(addReviewSchema), asyncHandler(reviewController.addReview));

module.exports = router;
