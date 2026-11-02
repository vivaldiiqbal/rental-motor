const adminMotorService = require('../../services/admin/adminMotorService');
const { successResponse } = require('../../utils/response');

const adminMotorController = {
  async getFilterOptions(req, res) {
    const options = await adminMotorService.getFilterOptions();
    return successResponse(res, { data: options });
  },

  async getMotorcycles(req, res) {
    const result = await adminMotorService.getMotorcycles(req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        filters: result.filters,
      },
    });
  },

  async getMotorcycleById(req, res) {
    const motor = await adminMotorService.getMotorcycleById(req.params.id);
    return successResponse(res, { data: motor });
  },

  async createMotorcycle(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const motor = await adminMotorService.createMotorcycle(req.body, reqContext);
    return successResponse(res, {
      data: motor,
      statusCode: 201,
      message: 'Armada motor baru berhasil ditambahkan.',
    });
  },

  async updateMotorcycle(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const motor = await adminMotorService.updateMotorcycle(req.params.id, req.body, reqContext);
    return successResponse(res, {
      data: motor,
      message: 'Data armada motor berhasil diperbarui.',
    });
  },

  async updateStatus(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const motor = await adminMotorService.updateMotorStatus(req.params.id, req.body.status, reqContext);
    return successResponse(res, {
      data: motor,
      message: `Status motor berhasil diubah menjadi ${req.body.status}.`,
    });
  },

  async addImages(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    let imageUrls = [];

    if (req.uploadedMotorImages && req.uploadedMotorImages.length > 0) {
      imageUrls = req.uploadedMotorImages.map((f) => f.url);
    } else if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      imageUrls = req.files.map((f) => `/uploads/motors/${f.filename}`);
    } else if (req.body.imageUrls) {
      imageUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [req.body.imageUrls];
    } else if (req.body.imageUrl) {
      imageUrls = [req.body.imageUrl];
    }

    const motor = await adminMotorService.addImages(req.params.id, imageUrls, reqContext);
    return successResponse(res, {
      data: motor,
      message: 'Foto armada motor berhasil ditambahkan.',
    });
  },

  async reorderImages(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const motor = await adminMotorService.reorderImages(req.params.id, req.body.imageUrls, reqContext);
    return successResponse(res, {
      data: motor,
      message: 'Urutan foto armada berhasil diperbarui.',
    });
  },

  async deleteImage(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const target = req.params.imageId || req.query.imageId;
    const motor = await adminMotorService.deleteImage(req.params.id, target, reqContext);
    return successResponse(res, {
      data: motor,
      message: 'Foto armada motor berhasil dihapus.',
    });
  },
};

module.exports = adminMotorController;
