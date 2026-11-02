const promoService = require('../services/promoService');
const { successResponse } = require('../utils/response');

const promoController = {
  async getActivePromos(req, res) {
    const promos = await promoService.getActivePromos();
    return successResponse(res, {
      data: promos,
    });
  },

  async validatePromo(req, res) {
    const result = await promoService.validatePromo(req.body);
    return successResponse(res, {
      data: result,
      message: 'Kode promo berhasil diterapkan.',
    });
  },
};

module.exports = promoController;
