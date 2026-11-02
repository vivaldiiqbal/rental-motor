const { promoRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');
const { isValidISODate } = require('../../utils/dates');

const promoService = {
  async getPromos(query = {}) {
    // Admin melihat semua promo termasuk yang tidak aktif
    const list = await promoRepo.findAll(false);
    return {
      items: list,
      total: list.length,
    };
  },

  async getPromoById(id) {
    const promo = await promoRepo.findById(id);
    if (!promo) {
      throw new AppError('Kode promo tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return promo;
  },

  async createPromo(data, reqContext = {}) {
    const { code, name, type, value, maxDiscount, minSpend, quota, validFrom, validUntil, description } = data;

    if (!code || !name || !type || value === undefined || !validFrom || !validUntil) {
      throw new AppError('Kode, nama, tipe, nilai, dan periode promo wajib diisi', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const normalizedCode = code.trim().toUpperCase();
    const existing = await promoRepo.findByCode(normalizedCode);
    if (existing) {
      throw new AppError(`Kode promo ${normalizedCode} sudah ada`, 409, ERROR_CODES.VALIDATION_ERROR);
    }

    if (type === 'percent') {
      const numVal = Number(value);
      if (numVal < 1 || numVal > 100) {
        throw new AppError('Nilai diskon persen harus antara 1 sampai 100', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    } else {
      const numVal = Number(value);
      if (numVal <= 0) {
        throw new AppError('Nilai diskon nominal harus lebih besar dari 0', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (!isValidISODate(validFrom) || !isValidISODate(validUntil)) {
      throw new AppError('Format tanggal validFrom dan validUntil harus YYYY-MM-DD yang valid', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (validFrom > validUntil) {
      throw new AppError('validFrom tidak boleh lebih besar dari validUntil', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      const newPromo = await promoRepo.create({
        code: normalizedCode,
        name: name.trim(),
        type,
        value: Number(value),
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        minSpend: minSpend ? Number(minSpend) : 0,
        quota: quota !== undefined ? Number(quota) : 100,
        validFrom,
        validUntil,
        description: description ? description.trim() : '',
        isActive: data.isActive !== false,
      });

      await recordAudit(
        reqContext,
        'CREATE_PROMO',
        'Promo',
        newPromo.id,
        null,
        newPromo
      );

      return newPromo;
    });
  },

  async updatePromo(id, data, reqContext = {}) {
    const existing = await promoRepo.findById(id);
    if (!existing) {
      throw new AppError('Kode promo tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (data.code) {
      const normalizedCode = data.code.trim().toUpperCase();
      const checkCode = await promoRepo.findByCode(normalizedCode);
      if (checkCode && String(checkCode.id) !== String(id)) {
        throw new AppError(`Kode promo ${normalizedCode} sudah digunakan`, 409, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    const type = data.type || existing.type;
    const value = data.value !== undefined ? Number(data.value) : existing.value;

    if (type === 'percent') {
      if (value < 1 || value > 100) {
        throw new AppError('Nilai diskon persen harus antara 1 sampai 100', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    } else {
      if (value <= 0) {
        throw new AppError('Nilai diskon nominal harus lebih besar dari 0', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    const validFrom = data.validFrom || existing.validFrom;
    const validUntil = data.validUntil || existing.validUntil;

    if (validFrom > validUntil) {
      throw new AppError('validFrom tidak boleh lebih besar dari validUntil', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      const patch = { ...data };
      if (data.value !== undefined) patch.value = Number(data.value);
      if (data.quota !== undefined) patch.quota = Number(data.quota);
      if (data.minSpend !== undefined) patch.minSpend = Number(data.minSpend);
      if (data.maxDiscount !== undefined) patch.maxDiscount = data.maxDiscount ? Number(data.maxDiscount) : null;

      const updated = await promoRepo.update(id, patch);

      await recordAudit(
        reqContext,
        'UPDATE_PROMO',
        'Promo',
        id,
        existing,
        updated
      );

      return updated;
    });
  },

  async togglePromoActive(id, isActive, reqContext = {}) {
    const existing = await promoRepo.findById(id);
    if (!existing) {
      throw new AppError('Kode promo tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const targetActive = isActive !== undefined ? Boolean(isActive) : !existing.isActive;

    return transaction(async (tx) => {
      const updated = await promoRepo.update(id, { isActive: targetActive });

      await recordAudit(
        reqContext,
        targetActive ? 'ACTIVATE_PROMO' : 'DEACTIVATE_PROMO',
        'Promo',
        id,
        { isActive: existing.isActive },
        { isActive: targetActive }
      );

      return updated;
    });
  },

  async deletePromo(id, reqContext = {}) {
    const existing = await promoRepo.findById(id);
    if (!existing) {
      throw new AppError('Kode promo tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const used = await promoRepo.hasUsage(existing.code);
    if (used) {
      throw new AppError(
        'Promo yang sudah pernah digunakan tidak dapat dihapus, silakan nonaktifkan.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return transaction(async (tx) => {
      await promoRepo.delete(id);

      await recordAudit(
        reqContext,
        'DELETE_PROMO',
        'Promo',
        id,
        existing,
        null
      );

      return { success: true };
    });
  },
};

module.exports = promoService;
