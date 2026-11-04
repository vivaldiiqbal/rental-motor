const { addonRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');
const pricingService = require('../pricingService');

const addonService = {
  async getAddons(query = {}) {
    const list = await addonRepo.findAll(query);
    return {
      items: list,
      total: list.length,
    };
  },

  async getAddonById(id) {
    const item = await addonRepo.findById(id);
    if (!item) {
      throw new AppError('Add-on tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return item;
  },

  async createAddon(data, reqContext = {}) {
    const { name, pricePerDay, price, description } = data;
    if (!name) {
      throw new AppError('Nama add-on wajib diisi', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const dailyPrice = Number(pricePerDay || price) || 0;
    if (dailyPrice < 0) {
      throw new AppError('Harga per hari harus integer non-negatif', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      const created = await addonRepo.create({
        name: name.trim(),
        price: dailyPrice,
        pricePerDay: dailyPrice,
        description: description ? description.trim() : '',
        isActive: data.isActive !== false,
      });

      await recordAudit(
        reqContext,
        'CREATE_ADDON',
        'Addon',
        created.id,
        null,
        created
      );

      pricingService.invalidateCache();
      return created;
    });
  },

  async updateAddon(id, data, reqContext = {}) {
    const existing = await addonRepo.findById(id);
    if (!existing) {
      throw new AppError('Add-on tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const patch = { ...data };
    if (data.name) patch.name = data.name.trim();
    if (data.pricePerDay !== undefined || data.price !== undefined) {
      const dailyPrice = Number(data.pricePerDay || data.price) || 0;
      if (dailyPrice < 0) {
        throw new AppError('Harga per hari harus integer non-negatif', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      patch.price = dailyPrice;
      patch.pricePerDay = dailyPrice;
    }

    return transaction(async (tx) => {
      const updated = await addonRepo.update(id, patch);

      await recordAudit(
        reqContext,
        'UPDATE_ADDON',
        'Addon',
        id,
        existing,
        updated
      );

      pricingService.invalidateCache();
      return updated;
    });
  },

  async toggleAddonActive(id, isActive, reqContext = {}) {
    const existing = await addonRepo.findById(id);
    if (!existing) {
      throw new AppError('Add-on tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const targetActive = isActive !== undefined ? Boolean(isActive) : !existing.isActive;

    return transaction(async (tx) => {
      const updated = await addonRepo.update(id, { isActive: targetActive });

      await recordAudit(
        reqContext,
        targetActive ? 'ACTIVATE_ADDON' : 'DEACTIVATE_ADDON',
        'Addon',
        id,
        { isActive: existing.isActive },
        { isActive: targetActive }
      );

      pricingService.invalidateCache();
      return updated;
    });
  },

  async deleteAddon(id, reqContext = {}) {
    const existing = await addonRepo.findById(id);
    if (!existing) {
      throw new AppError('Add-on tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const used = await addonRepo.hasUsage(id);
    if (used) {
      throw new AppError(
        'Add-on sudah pernah digunakan pada booking, silakan nonaktifkan alih-alih menghapus permanen.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return transaction(async (tx) => {
      await addonRepo.delete(id);

      await recordAudit(
        reqContext,
        'DELETE_ADDON',
        'Addon',
        id,
        existing,
        null
      );

      pricingService.invalidateCache();
      return { success: true };
    });
  },
};

module.exports = addonService;
