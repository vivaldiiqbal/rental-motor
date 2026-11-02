const locationService = require('../../services/admin/locationService');
const { successResponse } = require('../../utils/response');

const locationController = {
  async getLocations(req, res) {
    const result = await locationService.getLocations(req.query);
    return successResponse(res, {
      data: result.items,
      meta: { total: result.total },
    });
  },

  async getLocationById(req, res) {
    const item = await locationService.getLocationById(req.params.id);
    return successResponse(res, { data: item });
  },

  async createLocation(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await locationService.createLocation(req.body, reqContext);
    return successResponse(res, {
      data: item,
      statusCode: 201,
      message: 'Titik lokasi berhasil ditambahkan.',
    });
  },

  async updateLocation(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await locationService.updateLocation(req.params.id, req.body, reqContext);
    return successResponse(res, {
      data: item,
      message: 'Titik lokasi berhasil diperbarui.',
    });
  },

  async toggleActive(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await locationService.toggleLocationActive(req.params.id, req.body.isActive, reqContext);
    return successResponse(res, {
      data: item,
      message: `Status lokasi berhasil diubah menjadi ${item.isActive ? 'aktif' : 'nonaktif'}.`,
    });
  },

  async deleteLocation(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    await locationService.deleteLocation(req.params.id, reqContext);
    return successResponse(res, {
      message: 'Titik lokasi berhasil dihapus.',
    });
  },
};

module.exports = locationController;
