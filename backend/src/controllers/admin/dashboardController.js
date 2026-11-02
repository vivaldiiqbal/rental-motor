const dashboardService = require('../../services/admin/dashboardService');
const { successResponse } = require('../../utils/response');

const dashboardController = {
  async getSummary(req, res) {
    const data = await dashboardService.getSummary();
    return successResponse(res, { data });
  },

  async getRevenue(req, res) {
    const days = req.query.days ? Number(req.query.days) : 30;
    const data = await dashboardService.getRevenue(days);
    return successResponse(res, { data });
  },

  async getTasks(req, res) {
    const data = await dashboardService.getTasks();
    return successResponse(res, { data });
  },
};

module.exports = dashboardController;
