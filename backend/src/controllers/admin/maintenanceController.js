const maintenanceService = require('../../services/admin/maintenanceService');
const { successResponse } = require('../../utils/response');

const maintenanceController = {
  async getMaintenance(req, res) {
    const result = await maintenanceService.getMaintenanceBlocks(req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        total: result.total,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
      },
    });
  },

  async getMaintenanceById(req, res) {
    const item = await maintenanceService.getMaintenanceById(req.params.id);
    return successResponse(res, { data: item });
  },

  async createMaintenance(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await maintenanceService.createMaintenanceBlock(req.body, reqContext);
    return successResponse(res, {
      data: item,
      statusCode: 201,
      message: 'Jadwal servis/perawatan armada berhasil disimpan.',
    });
  },

  async updateMaintenance(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    if (req.body.status === 'completed' || req.body.action === 'complete') {
      const item = await maintenanceService.completeMaintenanceBlock(req.params.id, req.body, reqContext);
      return successResponse(res, {
        data: item,
        message: 'Jadwal servis berhasil diselesaikan dan motor kembali tersedia.',
      });
    }
    const item = await maintenanceService.updateMaintenanceBlock(req.params.id, req.body, reqContext);
    return successResponse(res, {
      data: item,
      message: 'Jadwal servis berhasil diperbarui.',
    });
  },

  async completeMaintenance(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const item = await maintenanceService.completeMaintenanceBlock(req.params.id, req.body, reqContext);
    return successResponse(res, {
      data: item,
      message: 'Jadwal servis berhasil diselesaikan dan motor kembali tersedia.',
    });
  },

  async deleteMaintenance(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    await maintenanceService.deleteMaintenanceBlock(req.params.id, reqContext);
    return successResponse(res, {
      message: 'Jadwal servis berhasil dihapus.',
    });
  },
};

module.exports = maintenanceController;
