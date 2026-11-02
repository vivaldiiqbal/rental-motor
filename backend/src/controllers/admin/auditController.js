const auditService = require('../../services/admin/auditService');
const { successResponse } = require('../../utils/response');

const auditController = {
  async getAuditLogs(req, res) {
    const result = await auditService.getAuditLogs(req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        total: result.total,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      },
    });
  },
};

module.exports = auditController;
