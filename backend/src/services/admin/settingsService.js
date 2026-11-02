const { settingsRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');
const eventBroadcaster = require('../realtime/eventBroadcaster');

// Short cache for high-frequency settings reads
let cachedSettings = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30000; // 30 detik

function invalidateCache() {
  cachedSettings = null;
  cacheExpiry = 0;
}

const settingsService = {
  async getSettings() {
    const now = Date.now();
    if (cachedSettings && now < cacheExpiry) {
      return { ...cachedSettings };
    }

    const settings = await settingsRepo.getSettings();
    cachedSettings = settings;
    cacheExpiry = now + CACHE_TTL_MS;
    return { ...settings };
  },

  async updateSettings(data, reqContext = {}) {
    const current = await this.getSettings();

    const minRentalDays = data.minRentalDays !== undefined ? Number(data.minRentalDays) : current.minRentalDays;
    const maxRentalDays = data.maxRentalDays !== undefined ? Number(data.maxRentalDays) : current.maxRentalDays;

    if (minRentalDays < 1) {
      throw new AppError('minRentalDays minimal 1 hari', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (maxRentalDays > 90) {
      throw new AppError('maxRentalDays maksimal 90 hari', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (minRentalDays > maxRentalDays) {
      throw new AppError('minRentalDays tidak boleh lebih besar dari maxRentalDays', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (data.paymentExpiryMinutes !== undefined) {
      const exp = Number(data.paymentExpiryMinutes);
      if (exp < 15 || exp > 1440) {
        throw new AppError('paymentExpiryMinutes harus antara 15 sampai 1440 menit (24 jam)', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.lateFeeToleranceMinutes !== undefined) {
      const tol = Number(data.lateFeeToleranceMinutes);
      if (tol < 0 || tol > 240) {
        throw new AppError('lateFeeToleranceMinutes harus antara 0 sampai 240 menit', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.lateFeePercentPerHour !== undefined) {
      const pct = Number(data.lateFeePercentPerHour);
      if (pct < 1 || pct > 100) {
        throw new AppError('lateFeePercentPerHour harus antara 1 sampai 100 persen', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.cancellationRefundPercent !== undefined) {
      const pct = Number(data.cancellationRefundPercent);
      if (pct < 0 || pct > 100) {
        throw new AppError('cancellationRefundPercent harus antara 0 sampai 100 persen', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.defaultDeposit !== undefined) {
      const dep = Number(data.defaultDeposit);
      if (dep < 0) {
        throw new AppError('defaultDeposit harus non-negatif', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.brandName !== undefined) {
      const brand = String(data.brandName).trim();
      if (!brand || brand.length > 100) {
        throw new AppError('Nama brand harus antara 1 sampai 100 karakter', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.whatsappNumber !== undefined) {
      const phone = String(data.whatsappNumber).trim();
      const phoneRegex = /^\+?[0-9]{8,20}$/;
      if (!phoneRegex.test(phone)) {
        throw new AppError('Nomor WhatsApp tidak valid (format 8-20 digit angka, opsional awalan +)', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.contactEmail !== undefined) {
      const email = String(data.contactEmail).trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError('Format email kontak tidak valid', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.address !== undefined) {
      const addr = String(data.address).trim();
      if (addr.length > 500) {
        throw new AppError('Alamat maksimal 500 karakter', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.operatingHours !== undefined) {
      const hours = String(data.operatingHours).trim();
      if (!hours || hours.length > 100) {
        throw new AppError('Jam operasional harus antara 1 sampai 100 karakter', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.minRenterAge !== undefined) {
      const age = Number(data.minRenterAge);
      if (Number.isNaN(age) || age < 17 || age > 100) {
        throw new AppError('Usia minimum penyewa harus antara 17 sampai 100 tahun', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    const expireInput = data.bookingExpireMinutes !== undefined ? data.bookingExpireMinutes : data.paymentExpiryMinutes;
    if (expireInput !== undefined) {
      const exp = Number(expireInput);
      if (Number.isNaN(exp) || exp < 5 || exp > 1440) {
        throw new AppError('Batas waktu pembayaran (bookingExpireMinutes) harus antara 5 sampai 1440 menit (24 jam)', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.cancellationPolicy !== undefined) {
      if (!Array.isArray(data.cancellationPolicy) || data.cancellationPolicy.length === 0) {
        throw new AppError('Kebijakan pembatalan (cancellationPolicy) harus berupa array berisikan minimal 1 aturan', 400, ERROR_CODES.VALIDATION_ERROR);
      }

      for (const tier of data.cancellationPolicy) {
        if (typeof tier !== 'object' || tier === null) {
          throw new AppError('Tiap tingkat kebijakan pembatalan harus berupa objek valid', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        const th = Number(tier.thresholdHours);
        const rp = Number(tier.refundPercent);
        if (Number.isNaN(th) || th < 0) {
          throw new AppError('Ambang jam pembatalan (thresholdHours) harus angka non-negatif', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        if (Number.isNaN(rp) || rp < 0 || rp > 100) {
          throw new AppError('Persentase refund (refundPercent) harus antara 0 sampai 100 persen', 400, ERROR_CODES.VALIDATION_ERROR);
        }
      }

      // Validasi urutan hierarki: ketika ambang jam menurun, persentase refund harus menurun atau tetap sama
      const sortedTiers = [...data.cancellationPolicy].sort((a, b) => Number(b.thresholdHours) - Number(a.thresholdHours));
      for (let i = 1; i < sortedTiers.length; i++) {
        const prev = sortedTiers[i - 1];
        const curr = sortedTiers[i];
        if (Number(curr.refundPercent) > Number(prev.refundPercent)) {
          throw new AppError(
            `Urutan kebijakan pembatalan tidak masuk akal: ambang ${curr.thresholdHours} jam memberikan refund (${curr.refundPercent}%) lebih besar daripada ambang ${prev.thresholdHours} jam (${prev.refundPercent}%)`,
            400,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
      }
    }

    const result = await transaction(async (tx) => {
      const patch = {};
      if (data.brandName !== undefined) patch.brandName = String(data.brandName).trim();
      if (data.whatsappNumber !== undefined) patch.whatsappNumber = String(data.whatsappNumber).trim();
      if (data.address !== undefined) patch.address = String(data.address).trim();
      if (data.contactEmail !== undefined) patch.contactEmail = String(data.contactEmail).trim();
      if (data.operatingHours !== undefined) patch.operatingHours = String(data.operatingHours).trim();
      if (data.minRenterAge !== undefined) patch.minRenterAge = Number(data.minRenterAge);
      if (data.minRentalDays !== undefined) patch.minRentalDays = minRentalDays;
      if (data.maxRentalDays !== undefined) patch.maxRentalDays = maxRentalDays;
      if (expireInput !== undefined) {
        patch.bookingExpireMinutes = Number(expireInput);
        patch.paymentExpiryMinutes = Number(expireInput);
      }
      if (data.lateFeeToleranceMinutes !== undefined) patch.lateFeeToleranceMinutes = Number(data.lateFeeToleranceMinutes);
      if (data.lateFeePercentPerHour !== undefined) patch.lateFeePercentPerHour = Number(data.lateFeePercentPerHour);
      if (data.defaultDeposit !== undefined) patch.defaultDeposit = Number(data.defaultDeposit);
      if (data.cancellationThresholdHours !== undefined) patch.cancellationThresholdHours = Number(data.cancellationThresholdHours);
      if (data.cancellationRefundPercent !== undefined) patch.cancellationRefundPercent = Number(data.cancellationRefundPercent);
      if (data.cancellationPolicy !== undefined) {
        patch.cancellationPolicy = [...data.cancellationPolicy].sort((a, b) => Number(b.thresholdHours) - Number(a.thresholdHours));
      }

      const updated = await tx.settingsRepo.updateSettings(patch);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'UPDATE_SETTINGS',
        'Settings',
        'global',
        current,
        updated
      );

      // Realtime Outbox Event
      await eventBroadcaster.publish(tx, {
        type: 'settings.changed',
        entityId: 'global',
        userId: null,
        payload: { action: 'settings_updated' },
      });

      return updated;
    });

    invalidateCache();
    return result;
  },

  async resetSettings(reqContext = {}) {
    const current = await this.getSettings();

    const result = await transaction(async (tx) => {
      const reset = await tx.settingsRepo.resetSettings();

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'RESET_SETTINGS',
        'Settings',
        'global',
        current,
        reset
      );

      // Realtime Outbox Event
      await eventBroadcaster.publish(tx, {
        type: 'settings.changed',
        entityId: 'global',
        userId: null,
        payload: { action: 'settings_reset' },
      });

      return reset;
    });

    invalidateCache();
    return result;
  },

  invalidateCache() {
    invalidateCache();
  },
};

module.exports = settingsService;
