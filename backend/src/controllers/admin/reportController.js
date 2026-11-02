const reportService = require('../../services/admin/reportService');
const { successResponse } = require('../../utils/response');

function handleReportResponse(res, result) {
  if (result.isCsv) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(result.csv);
  }
  return successResponse(res, { data: result });
}

const reportController = {
  async getRevenueReport(req, res) {
    const result = await reportService.getRevenueReport(req.query);
    return handleReportResponse(res, result);
  },

  async getUtilizationReport(req, res) {
    const result = await reportService.getUtilizationReport(req.query);
    return handleReportResponse(res, result);
  },

  async getTopMotorsReport(req, res) {
    const result = await reportService.getTopMotorsReport(req.query);
    return handleReportResponse(res, result);
  },

  async getBookingsSummaryReport(req, res) {
    const result = await reportService.getBookingsSummaryReport(req.query);
    return handleReportResponse(res, result);
  },
};

module.exports = reportController;
