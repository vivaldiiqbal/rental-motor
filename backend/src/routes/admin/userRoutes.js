const express = require('express');
const router = express.Router();
const adminUserController = require('../../controllers/admin/adminUserController');
const renterProfileController = require('../../controllers/renterProfileController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Manajemen Pengguna: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(adminUserController.getUsers));
router.get('/:id', asyncHandler(adminUserController.getUserById));
router.get('/:id/renter-profile', asyncHandler(renterProfileController.getUserProfileByAdmin));
router.patch('/:id/active', asyncHandler(adminUserController.toggleActive));
router.patch('/:id/role', asyncHandler(adminUserController.updateRole));

module.exports = router;
