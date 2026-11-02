const promoService = require('../../services/admin/promoService');
const { successResponse } = require('../../utils/response');

const promoController = {
  async getPromos(req, res) {
    const result = await promoService.getPromos(req.query);
    return successResponse(res, {
      data: result.items,
      meta: { total: result.total },
    });
  },

  async getPromoById(req, res) {
    const promo = await promoService.getPromoById(req.params.id);
    return successResponse(res, { data: promo });
  },

  async createPromo(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const promo = await promoService.createPromo(req.body, reqContext);
    return successResponse(res, {
      data: promo,
      statusCode: 201,
      message: 'Kode promo baru berhasil dibuat.',
    });
  },

  async updatePromo(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const promo = await promoService.updatePromo(req.params.id, req.body, reqContext);
    return successResponse(res, {
      data: promo,
      message: 'Kode promo berhasil diperbarui.',
    });
  },

  async toggleActive(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const promo = await promoService.togglePromoActive(req.params.id, req.body.isActive, reqContext);
    return successResponse(res, {
      data: promo,
      message: `Status promo berhasil diubah menjadi ${promo.isActive ? 'aktif' : 'nonaktif'}.`,
    });
  },

  async deletePromo(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    await promoService.deletePromo(req.params.id, reqContext);
    return successResponse(res, {
      message: 'Kode promo berhasil dihapus.',
    });
  },
};

module.exports = promoController;
