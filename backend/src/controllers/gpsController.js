const gpsIngestService = require('../services/gps/gpsIngestService');
const { successResponse } = require('../utils/response');

const gpsController = {
  /**
   * Endpoint ingest data posisi dari penyedia GPS (Simulator, Traccar, atau Generic Webhook)
   * POST /api/gps/ingest/:provider atau POST /api/gps/ingest
   * Mengembalikan status 202 Accepted secara cepat
   */
  async ingest(req, res, next) {
    try {
      const result = await gpsIngestService.processIngest(req);
      return successResponse(res, {
        data: result,
        message: 'Data posisi GPS diterima untuk diproses.',
        statusCode: 202,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = gpsController;
