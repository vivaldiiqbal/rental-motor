const settingsService = require('../../services/admin/settingsService');
const { successResponse } = require('../../utils/response');

const settingsController = {
  async getSettings(req, res) {
    const data = await settingsService.getSettings();
    return successResponse(res, { data });
  },

  async updateSettings(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const data = await settingsService.updateSettings(req.body, reqContext);
    return successResponse(res, {
      data,
      message: 'Pengaturan sistem berhasil diperbarui.',
    });
  },

  async resetSettings(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const data = await settingsService.resetSettings(reqContext);
    return successResponse(res, {
      data,
      message: 'Pengaturan sistem berhasil direset ke nilai default.',
    });
  },
};

module.exports = settingsController;
