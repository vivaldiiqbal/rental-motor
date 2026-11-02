const paymentService = require('../services/paymentService');
const { successResponse } = require('../utils/response');

const paymentController = {
  async createPayment(req, res) {
    const { bookingId, method } = req.body;
    const result = await paymentService.createPayment({ bookingId, method }, req.user);
    return successResponse(res, {
      data: result,
      statusCode: 201,
      message: 'Instruksi pembayaran berhasil dibuat.',
    });
  },

  async simulatePay(req, res) {
    const { id } = req.params;
    const result = await paymentService.simulatePayment(id, req.user);
    return successResponse(res, {
      data: result.booking,
      message: result.message,
    });
  },

  async getPaymentByBooking(req, res) {
    const { bookingId } = req.params;
    const status = await paymentService.getPaymentStatus(bookingId, req.user);
    return successResponse(res, {
      data: status,
    });
  },

  async handleNotification(req, res) {
    const signature = req.headers['x-callback-signature'] || req.headers['x-signature'] || req.headers['authorization'];
    const result = await paymentService.handleWebhookNotification(req.body, signature);
    return successResponse(res, {
      data: result,
      message: 'Notifikasi webhook pembayaran berhasil diproses.',
    });
  },
};

module.exports = paymentController;
