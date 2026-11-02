const addonService = require('../../services/admin/addonService');
const { successResponse } = require('../../utils/response');

const addonController = {
  async getAddons(req, res) {
    const result = await addonService.getAddons(req.query);
    return successResponse(res, {
      data: result.items,
      meta: { total: result.total },
    });
  },

  async getAddonById(req, res) {
    const item = await addonService.getAddonById(req.params.id);
    return successResponse(res, { data: item });
  },

  async createAddon(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await addonService.createAddon(req.body, reqContext);
    return successResponse(res, {
      data: item,
      statusCode: 201,
      message: 'Layanan add-on berhasil ditambahkan.',
    });
  },

  async updateAddon(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await addonService.updateAddon(req.params.id, req.body, reqContext);
    return successResponse(res, {
      data: item,
      message: 'Layanan add-on berhasil diperbarui.',
    });
  },

  async toggleActive(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await addonService.toggleAddonActive(req.params.id, req.body.isActive, reqContext);
    return successResponse(res, {
      data: item,
      message: `Status add-on berhasil diubah menjadi ${item.isActive ? 'aktif' : 'nonaktif'}.`,
    });
  },

  async deleteAddon(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    await addonService.deleteAddon(req.params.id, reqContext);
    return successResponse(res, {
      message: 'Layanan add-on berhasil dihapus.',
    });
  },
};

module.exports = addonController;
