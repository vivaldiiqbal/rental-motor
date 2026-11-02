const express = require('express');
const router = express.Router();
const auditController = require('../../controllers/admin/auditController');
const asyncHandler = require('../../middleware/asyncHandler');
const { requireRole } = require('../../middleware/requireRole');

// Audit Logs: Khusus Admin
router.use(requireRole('admin'));

router.get('/', asyncHandler(auditController.getAuditLogs));

module.exports = router;
