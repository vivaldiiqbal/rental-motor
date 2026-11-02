const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const renterProfileController = require('../controllers/renterProfileController');
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadDocumentsMiddleware } = require('../middleware/upload');
const { authLimiter, sensitiveFormLimiter } = require('../middleware/rateLimiters');
const {
  registerSchema,
  loginSchema,
  updateMeSchema,
  updatePasswordSchema,
  forgotPasswordSchema,
} = require('../validators/authValidator');

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(authController.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));

router.get('/me', protect, asyncHandler(authController.getMe));
router.put('/me', protect, validate(updateMeSchema), asyncHandler(authController.updateMe));
router.put('/password', protect, validate(updatePasswordSchema), asyncHandler(authController.updatePassword));

// Profil Penyewa & Status Kesiapan (Sumber Data Tunggal)
router.get('/renter-profile', protect, asyncHandler(renterProfileController.getMyProfile));
router.put('/renter-profile', protect, asyncHandler(renterProfileController.updateMyProfile));
router.get('/renter-readiness', protect, asyncHandler(renterProfileController.getMyReadiness));

router.post('/documents', protect, uploadDocumentsMiddleware(), asyncHandler(authController.uploadDocuments));
router.get('/documents', protect, asyncHandler(authController.getMyDocuments));
router.get('/documents/:type', protect, asyncHandler(authController.getDocument));

router.post('/forgot-password', sensitiveFormLimiter, validate(forgotPasswordSchema), asyncHandler(authController.forgotPassword));

module.exports = router;
