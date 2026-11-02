const { locationRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');

const locationService = {
  async getLocations(query = {}) {
    const list = await locationRepo.findAll(query);
    return {
      items: list,
      total: list.length,
    };
  },

  async getLocationById(id) {
    const item = await locationRepo.findById(id);
    if (!item) {
      throw new AppError('Titik lokasi tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return item;
  },

  async createLocation(data, reqContext = {}) {
    const { name, fee, isDelivery } = data;
    if (!name) {
      throw new AppError('Nama lokasi wajib diisi', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const deliveryFee = fee !== undefined ? Number(fee) : 0;
    if (deliveryFee < 0) {
      throw new AppError('Biaya pengantaran harus integer non-negatif', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      const created = await locationRepo.create({
        name: name.trim(),
        fee: deliveryFee,
        isDelivery: isDelivery !== undefined ? Boolean(isDelivery) : deliveryFee > 0,
        isActive: data.isActive !== false,
      });

      await recordAudit(
        reqContext,
        'CREATE_LOCATION',
        'Location',
        created.id,
        null,
        created
      );

      return created;
    });
  },

  async updateLocation(id, data, reqContext = {}) {
    const existing = await locationRepo.findById(id);
    if (!existing) {
      throw new AppError('Titik lokasi tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const patch = { ...data };
    if (data.name) patch.name = data.name.trim();
    if (data.fee !== undefined) {
      const deliveryFee = Number(data.fee);
      if (deliveryFee < 0) {
        throw new AppError('Biaya pengantaran harus integer non-negatif', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      patch.fee = deliveryFee;
    }

    return transaction(async (tx) => {
      const updated = await locationRepo.update(id, patch);

      await recordAudit(
        reqContext,
        'UPDATE_LOCATION',
        'Location',
        id,
        existing,
        updated
      );

      return updated;
    });
  },

  async toggleLocationActive(id, isActive, reqContext = {}) {
    const existing = await locationRepo.findById(id);
    if (!existing) {
      throw new AppError('Titik lokasi tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const targetActive = isActive !== undefined ? Boolean(isActive) : !existing.isActive;

    return transaction(async (tx) => {
      const updated = await locationRepo.update(id, { isActive: targetActive });

      await recordAudit(
        reqContext,
        targetActive ? 'ACTIVATE_LOCATION' : 'DEACTIVATE_LOCATION',
        'Location',
        id,
        { isActive: existing.isActive },
        { isActive: targetActive }
      );

      return updated;
    });
  },

  async deleteLocation(id, reqContext = {}) {
    const existing = await locationRepo.findById(id);
    if (!existing) {
      throw new AppError('Titik lokasi tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const used = await locationRepo.hasUsage(id);
    if (used) {
      throw new AppError(
        'Lokasi sudah pernah digunakan pada booking, silakan nonaktifkan alih-alih menghapus permanen.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return transaction(async (tx) => {
      await locationRepo.delete(id);

      await recordAudit(
        reqContext,
        'DELETE_LOCATION',
        'Location',
        id,
        existing,
        null
      );

      return { success: true };
    });
  },
};

module.exports = locationService;
