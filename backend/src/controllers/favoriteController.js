const favoriteService = require('../services/favoriteService');
const { successResponse } = require('../utils/response');

const favoriteController = {
  async getFavorites(req, res) {
    const motors = await favoriteService.getUserFavorites(req.user.id);
    return successResponse(res, {
      data: motors,
    });
  },

  async addFavorite(req, res) {
    const motorId = req.params.motorId || req.body.motorId;
    const result = await favoriteService.addFavorite(req.user.id, motorId);
    return successResponse(res, {
      data: result,
      message: 'Motor berhasil ditambahkan ke daftar favorit.',
    });
  },

  async removeFavorite(req, res) {
    const motorId = req.params.motorId || req.body.motorId;
    const result = await favoriteService.removeFavorite(req.user.id, motorId);
    return successResponse(res, {
      data: result,
      message: 'Motor dihapus dari daftar favorit.',
    });
  },

  async syncFavorites(req, res) {
    const motorIds = req.body.motorIds || [];
    const result = await favoriteService.syncFavorites(req.user.id, motorIds);
    return successResponse(res, {
      data: result,
      message: 'Daftar favorit berhasil disinkronkan.',
    });
  },
};

module.exports = favoriteController;
