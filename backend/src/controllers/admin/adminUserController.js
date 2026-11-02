const adminUserService = require('../../services/admin/adminUserService');
const { successResponse } = require('../../utils/response');

const adminUserController = {
  async getUsers(req, res) {
    const result = await adminUserService.getUsers(req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        total: result.total,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      },
    });
  },

  async getUserById(req, res) {
    const result = await adminUserService.getUserById(req.params.id);
    return successResponse(res, { data: result });
  },

  async toggleActive(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const user = await adminUserService.toggleUserActive(req.params.id, req.body.isActive, reqContext);
    return successResponse(res, {
      data: user,
      message: `Status aktif pengguna berhasil diubah menjadi ${req.body.isActive ? 'aktif' : 'nonaktif'}.`,
    });
  },

  async updateRole(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const user = await adminUserService.updateUserRole(req.params.id, req.body.role, reqContext);
    return successResponse(res, {
      data: user,
      message: `Peran pengguna berhasil diubah menjadi ${req.body.role}.`,
    });
  },
};

module.exports = adminUserController;
